#!/usr/bin/env node
/**
 * Format-scope gate (CH10 / AGENTS.md `pnpm lint`).
 *
 * This is deliberate, not an oversight:
 *   - Prettier owns docs and config (the path list below).
 *   - ESLint owns TypeScript / JavaScript source style.
 *
 * Source globs (packages star-star slash star.ts) are ABSENT on
 * purpose. Zero of the published packages define a format script.
 * Do not add source globs here while ~17 agents are writing — a
 * first-time Prettier pass across the workspace is a review-killing
 * diff, not a quality win.
 *
 * The root `package.json` `"prettier"` key pins the tab convention
 * used in hand-written TS/JS so an accidental `prettier --write` on
 * source does not convert tabs to Prettier's 2-space default (that
 * reflex damaged a tree today). Docs/config in this path list stay
 * 2-space, which is what `prettier --check` already enforced.
 *
 * A missing Prettier binary fails closed. An empty path list fails
 * closed (skip of nothing).
 */

import { spawnSync } from "node:child_process";
import fs, { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * Docs and config only. Source (ts / tsx / scripts mjs) is eslint's.
 * Keep this list explicit — a recursive star glob would silently
 * start formatting 38 packages.
 */
export const FORMAT_PATHS = [
	"README.md",
	"AGENTS.md",
	"CLA.md",
	"CODE_OF_CONDUCT.md",
	"CONTRIBUTING.md",
	"LICENSE.md",
	"SECURITY.md",
	"SUPPORT.md",
	"package.json",
	"pnpm-workspace.yaml",
	"turbo.json",
	"tsconfig.base.json",
	"playwright.config.ts",
	"vitest.config.ts",
	".github/**/*.yml",
	"packages/**/README.md",
	"packages/**/package.json",
	"playground/package.json",
	"playground/README.md",
	"internal/kitchen-sink/package.json",
	"internal/kitchen-sink/README.md",
	"spec/**/*.md",
	"spec-v2/**/*.md",
	"spec-v3/**/*.md",
];

export function expandFormatPaths(repoRoot, paths = FORMAT_PATHS) {
	const expanded = [];
	const emptyGlobs = [];
	for (const entry of paths) {
		if (entry.includes("*")) {
			const matched = globSync(entry, { cwd: repoRoot });
			if (matched.length === 0) {
				emptyGlobs.push(entry);
			}
			expanded.push(...matched);
		} else {
			expanded.push(entry);
		}
	}
	return { expanded, emptyGlobs };
}

export function evaluateFormatScope({
	paths = FORMAT_PATHS,
	emptyGlobs = [],
} = {}) {
	const sourceGlobs = paths.filter(
		(entry) =>
			/\*\*\/\*\.(?:[cm]?[jt]sx?)$/.test(entry) ||
			entry === "packages/**/*.ts" ||
			entry.endsWith("/*.ts") ||
			entry.endsWith("/*.tsx") ||
			entry.endsWith("/*.mjs"),
	);
	return {
		ok:
			paths.length > 0 &&
			sourceGlobs.length === 0 &&
			emptyGlobs.length === 0,
		paths,
		sourceGlobs,
		empty: paths.length === 0,
		emptyGlobs,
	};
}

export function formatScopeReport(result) {
	const lines = ["CH10 lint-format scope"];
	lines.push("");
	lines.push(
		"Prettier owns docs/config. ESLint owns TypeScript/JavaScript source.",
	);
	lines.push(`paths   ${result.paths.length}`);
	if (result.expandedCount != null) {
		lines.push(`files   ${result.expandedCount}`);
	}
	if (result.empty) {
		lines.push("");
		lines.push("FAIL lint-format: path list is empty (skip of nothing).");
	}
	if ((result.emptyGlobs ?? []).length > 0) {
		lines.push("");
		lines.push(
			"FAIL lint-format: path glob matched 0 files (skip of nothing):",
		);
		for (const glob of result.emptyGlobs) {
			lines.push(`  ${glob}`);
		}
	}
	if (result.sourceGlobs.length > 0) {
		lines.push("");
		lines.push(
			"FAIL lint-format: source globs are present; that is a silent reformat of the workspace:",
		);
		for (const glob of result.sourceGlobs) {
			lines.push(`  ${glob}`);
		}
	}
	if (result.ok) {
		lines.push("");
		lines.push(
			"OK: format check is docs/config only; source style is eslint.",
		);
	}
	return lines.join("\n");
}

export function runSelfTests() {
	const healthy = evaluateFormatScope();
	if (!healthy.ok) {
		throw new Error(
			"self-test: committed path list must be docs/config only",
		);
	}
	const empty = evaluateFormatScope({ paths: [] });
	if (empty.ok || !empty.empty) {
		throw new Error("self-test: empty path list must fail closed");
	}
	const widened = evaluateFormatScope({
		paths: [...FORMAT_PATHS, "packages/**/*.ts"],
	});
	if (widened.ok || !widened.sourceGlobs.includes("packages/**/*.ts")) {
		throw new Error("self-test: a source glob must fail closed");
	}
	const emptyGlob = evaluateFormatScope({
		paths: FORMAT_PATHS,
		emptyGlobs: ["does-not-exist-mutation/**/*.md"],
	});
	if (emptyGlob.ok || emptyGlob.emptyGlobs.length !== 1) {
		throw new Error("self-test: a glob matching 0 files must fail closed");
	}
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let checkOnly = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--scope-only") {
			checkOnly = true;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, checkOnly };
}

function findPrettier(repoRoot) {
	const bin = path.join(
		repoRoot,
		"node_modules",
		"prettier",
		"bin",
		"prettier.cjs",
	);
	if (fs.existsSync(bin)) {
		return bin;
	}
	return null;
}

async function main() {
	runSelfTests();
	console.log("CH10 lint-format self-test ok");
	console.log(
		"  red-proof: empty path list, a packages/**/*.ts glob, and a 0-file glob fail closed",
	);
	console.log(
		"  scope: Prettier owns docs/config; ESLint owns TypeScript/JavaScript source",
	);

	const args = parseArgs(process.argv.slice(2));
	const expansion = expandFormatPaths(args.repoRoot);
	const scope = evaluateFormatScope({
		emptyGlobs: expansion.emptyGlobs,
	});
	scope.expandedCount = expansion.expanded.length;
	console.log("");
	console.log(
		`population: ${expansion.expanded.length} files from ${FORMAT_PATHS.length} path entries`,
	);
	console.log(formatScopeReport(scope));
	if (!scope.ok) {
		process.exitCode = 1;
		return;
	}
	if (args.checkOnly) {
		return;
	}

	const prettier = findPrettier(args.repoRoot);
	if (prettier == null) {
		console.error("lint-format: missing prettier (pnpm install first)");
		process.exitCode = 1;
		return;
	}

	const result = spawnSync(
		process.execPath,
		[prettier, "--check", ...FORMAT_PATHS],
		{
			cwd: args.repoRoot,
			encoding: "utf8",
			stdio: "inherit",
		},
	);
	if (result.error) {
		console.error(result.error.message);
		process.exitCode = 1;
		return;
	}
	if (result.status !== 0) {
		process.exitCode = result.status ?? 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
