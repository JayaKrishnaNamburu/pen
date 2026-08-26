#!/usr/bin/env node
/**
 * Local mirror of the pull-request gate set (`pnpm verify`).
 *
 * A pull request against this repository lands on roughly thirty checks
 * across nine workflows. A contributor who runs the five commands in
 * CONTRIBUTING.md and pushes still meets a red X from a gate they have
 * never heard of, waits ten minutes, and guesses. This runs the same set
 * locally, in the same order, and prints one summary naming the workflow
 * each failure came from.
 *
 * The static gate list is read from scripts/gates.json, which is also what
 * .github/workflows/static-gates.yml builds its matrix from. Adding a gate
 * there adds it here; the two cannot drift.
 *
 * The build-dependent steps below mirror the `validate` job in
 * .github/workflows/ci.yml. That job's steps are named individually on
 * purpose (the GitHub UI times them separately), so this list is the one
 * place that restates them. Keep the two in step.
 *
 * Not covered here, because both need browser binaries this script will not
 * install for you:
 *
 *   pnpm exec playwright install --with-deps chromium
 *   pnpm test:e2e                                        # ci.yml e2e
 *   pnpm --filter @input/pen-conformance run test:chromium
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const GATES_FILE = path.join(SCRIPT_DIR, "gates.json");

/**
 * Steps that need `dist/` to exist, in the order ci.yml runs them.
 * `workflow` is the check name a contributor will see go red on GitHub.
 */
const BUILD_STAGE = [
	{
		id: "build",
		command: "pnpm build",
		workflow: "CI / validate",
		description: "Every package compiles.",
	},
	{
		id: "api-reports",
		command: "node scripts/api-reports.mjs",
		workflow: "CI / validate",
		description:
			"Committed api-report.md matches the built .d.ts. Rerun with --write to accept.",
	},
	{
		id: "types-purity",
		command: "node scripts/types-purity.mjs",
		workflow: "CI / validate",
		description: "@input/pen-types stays types-only (API3).",
	},
	{
		id: "strip-internal",
		command: "node scripts/strip-internal.mjs",
		workflow: "CI / validate",
		description: "@internal does not leak into published .d.ts (API4).",
	},
	{
		id: "doc-refs",
		command: "pnpm doc-refs",
		workflow: "Static gates / doc-refs",
		description:
			"Docs reference real packages and their samples typecheck.",
	},
	{
		id: "typecheck",
		command: "pnpm typecheck",
		workflow: "CI / validate",
		description: "Every package typechecks against its dependencies.",
	},
	{
		id: "test",
		command: "pnpm test",
		workflow: "CI / validate",
		description: "Unit and integration suites, all workspaces.",
	},
];

export function buildPlan(gates) {
	const asStep = (gate) => ({
		id: gate.id,
		command: gate.command,
		workflow: `Static gates / ${gate.id}`,
		description: gate.description,
	});

	// A `needsBuild` gate reads dist/ or resolves workspace types, so it has to
	// run after `pnpm build` — the same split static-gates.yml makes. Running
	// them immediately after the build, rather than at the end, keeps the fast
	// failure fast: typecheck and test are the slow steps behind them.
	const sourceGates = gates.filter((gate) => !gate.needsBuild);
	const builtGates = gates.filter((gate) => gate.needsBuild);
	const [build, ...afterBuild] = BUILD_STAGE;

	return [
		{
			id: "lint",
			command: "pnpm lint",
			workflow: "CI / validate",
			description: "Prettier on docs and config, ESLint on source.",
		},
		{
			id: "changeset-check",
			command: "node scripts/changeset-check.mjs",
			workflow: "Static gates / changeset",
			description:
				"Published packages whose shipped source changed are named in a changeset.",
		},
		...sourceGates.map(asStep),
		build,
		...builtGates.map(asStep),
		...afterBuild,
	];
}

function loadGates() {
	const gates = JSON.parse(fs.readFileSync(GATES_FILE, "utf8"));
	if (!Array.isArray(gates) || gates.length === 0) {
		throw new Error(
			"verify: scripts/gates.json is empty or not an array (skip of nothing)",
		);
	}
	for (const gate of gates) {
		if (
			typeof gate?.id !== "string" ||
			typeof gate?.command !== "string" ||
			typeof gate?.description !== "string"
		) {
			throw new Error(
				`verify: scripts/gates.json entries need id, command, and description: ${JSON.stringify(gate)}`,
			);
		}
		if (
			gate.needsBuild !== undefined &&
			typeof gate.needsBuild !== "boolean"
		) {
			throw new Error(
				`verify: gate ${gate.id} has a non-boolean needsBuild; static-gates.yml reads it as a matrix condition`,
			);
		}
	}
	return gates;
}

function runStep(step) {
	const startedAt = Date.now();
	console.log("");
	console.log(`──▸ ${step.id}`);
	console.log(`    ${step.description}`);
	console.log(`    $ ${step.command}`);
	console.log("");

	const result = spawnSync(step.command, {
		cwd: REPO_ROOT,
		shell: true,
		stdio: "inherit",
	});

	return {
		...step,
		ok: result.status === 0,
		durationMs: Date.now() - startedAt,
	};
}

function formatSummary(results, skipped) {
	const failed = results.filter((result) => !result.ok);
	const lines = ["", "─".repeat(64), "verify summary", ""];

	for (const result of results) {
		const seconds = (result.durationMs / 1000).toFixed(1).padStart(6);
		lines.push(
			`  ${result.ok ? "pass" : "FAIL"}  ${seconds}s  ${result.id}`,
		);
	}
	for (const step of skipped) {
		lines.push(`  skip           ${step.id}`);
	}

	lines.push("");
	// Nothing is skipped unless --bail tripped, so a clean run is a full run.
	if (failed.length === 0) {
		lines.push(
			`All ${results.length} checks passed. Browser suites are not included; see the header of scripts/verify.mjs.`,
		);
		return lines.join("\n");
	}

	lines.push(`${failed.length} check(s) failed. On GitHub these are:`);
	lines.push("");
	for (const result of failed) {
		lines.push(`  ${result.workflow}`);
		lines.push(`    $ ${result.command}`);
	}
	return lines.join("\n");
}

function parseArgs(argv) {
	let bail = false;
	let list = false;
	let filter = null;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--bail") {
			bail = true;
			continue;
		}
		if (arg === "--list") {
			list = true;
			continue;
		}
		if (arg === "--only") {
			filter = argv[i + 1] ?? null;
			i += 1;
			continue;
		}
		throw new Error(
			`Unknown flag: ${arg}. Supported: --bail, --list, --only <substring>.`,
		);
	}
	return { bail, list, filter };
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const plan = buildPlan(loadGates()).filter(
		(step) => args.filter == null || step.id.includes(args.filter),
	);

	if (plan.length === 0) {
		throw new Error(`verify: --only ${args.filter} matched no step`);
	}

	if (args.list) {
		for (const step of plan) {
			console.log(`${step.id.padEnd(26)} ${step.command}`);
		}
		return;
	}

	console.log(
		`verify: ${plan.length} checks, mirroring the pull-request gates.`,
	);

	const results = [];
	const skipped = [];
	for (const step of plan) {
		if (args.bail && results.some((result) => !result.ok)) {
			skipped.push(step);
			continue;
		}
		results.push(runStep(step));
	}

	console.log(formatSummary(results, skipped));
	if (results.some((result) => !result.ok)) {
		process.exitCode = 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
