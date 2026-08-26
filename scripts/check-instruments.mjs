#!/usr/bin/env node
/**
 * Runs the fast assertive instruments as one check.
 *
 * `pnpm build`, `pnpm typecheck`, and `pnpm test` do not execute any allowlist
 * or catalog checker, so drift in them is invisible to a lane that verifies the
 * usual three. Every instrument here otherwise runs only from a wave gate.
 *
 * Results accumulate: a failing instrument does not stop the rest, so one run
 * reports every failure instead of the first (spec/rules/reliability.md GA18).
 *
 * Excluded on purpose: codemods (`migrate-*`), recorders (`record-*`,
 * `*-inventory`), writers (`api-reports`, `sync:package-metadata` without
 * `--check`), and the slow release gates (`release-check`,
 * `verdaccio-closure-check`, `size-limit`), which wave gates still own.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

// `needsDist` instruments read built .d.ts files and report INCONCLUSIVE when a
// package's source is newer than its dist, which is a real finding rather than
// noise — it means the artifact under inspection is not the source under review.
const INSTRUMENTS = [
	{ script: "instrument-paths" },
	{ script: "no-selection-state-properties" },
	{ script: "types-purity" },
	{ script: "dag-check" },
	{ script: "workspace-pins" },
	{ script: "catalog:check" },
	{ script: "command-catalog-check" },
	{ script: "skip-hygiene" },
	{ script: "coverage:rules" },
	{ script: "above-floor-api-allowlist" },
	{ script: "pen-stream-request-no-editor" },
	{ script: "readme-sections" },
	{ script: "wave-deletions-migration-check" },
	{ script: "doc-refs", needsDist: true },
	{ script: "migration-guide-check", needsDist: true },
	{ script: "api-docs-coverage", needsDist: true },
	{ script: "sync:package-metadata", args: ["--check"] },
];

function run({ script, args = [] }) {
	const startedAt = Date.now();
	const result = spawnSync("pnpm", ["-s", script, ...args], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	});
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
	return {
		script,
		ok: result.status === 0,
		durationMs: Date.now() - startedAt,
		output,
	};
}

function lastLines(output, count) {
	return output.split("\n").slice(-count).join("\n");
}

function main() {
	const results = INSTRUMENTS.map((instrument) => ({
		...run(instrument),
		needsDist: instrument.needsDist === true,
	}));

	for (const result of results) {
		const status = result.ok ? "ok  " : "FAIL";
		console.log(
			`${status} ${result.script.padEnd(30)} ${result.durationMs}ms`,
		);
	}

	const failures = results.filter((result) => !result.ok);
	if (failures.length === 0) {
		console.log(`\ncheck-instruments: ${results.length} instruments ok.`);
		return;
	}

	console.log("");
	for (const failure of failures) {
		console.log(`─── ${failure.script} ───`);
		console.log(lastLines(failure.output, 12));
		console.log("");
	}

	if (failures.some((failure) => failure.needsDist)) {
		console.log(
			"Note: doc-refs / migration-guide-check / api-docs-coverage read built .d.ts files. Run `pnpm build` first; a stale dist reports INCONCLUSIVE, which is not a pass.",
		);
	}

	console.log(
		`check-instruments: ${failures.length} of ${results.length} failed (${failures.map((failure) => failure.script).join(", ")}).`,
	);
	process.exitCode = 1;
}

main();
