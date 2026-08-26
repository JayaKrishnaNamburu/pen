#!/usr/bin/env node
/**
 * CH5 console.* inventory (spec/rules/reliability.md CH5,
 * Wave H step H.4).
 *
 * Lists every console.log / console.warn / console.error / console.info /
 * console.debug in package `src` trees, excluding tests. Prints file:line.
 * Always exits 0 — this is a burn-down report, not a failing gate.
 * The workspace sweep is contested (React primitives, bench reporters);
 * this script does not convert sites.
 *
 *   node scripts/console-inventory.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const SCAN_ROOT = "packages";

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".mts",
	".cts",
]);

const CONSOLE_RE = /console\.(?:log|warn|error|info|debug)/;
const SRC_DIR_RE = /(?:^|\/)src\//;

export function isTestFile(relPath) {
	const parts = relPath.split(/[\\/]/);
	if (parts.includes("__tests__")) {
		return true;
	}
	return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(parts[parts.length - 1]);
}

export function toPosix(relPath) {
	return relPath.split(path.sep).join(path.posix.sep);
}

export function collectConsoleHits(repoRoot = DEFAULT_REPO_ROOT) {
	const files = [];
	walk(path.join(repoRoot, SCAN_ROOT), SCAN_ROOT, files);
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	for (const file of files) {
		let source;
		try {
			source = fs.readFileSync(path.join(repoRoot, file), "utf8");
		} catch {
			continue;
		}
		const lines = source.split(/\r?\n/);
		for (let index = 0; index < lines.length; index += 1) {
			if (CONSOLE_RE.test(lines[index])) {
				hits.push({ file, line: index + 1 });
			}
		}
	}
	return hits;
}

function walk(absDir, relDir, out) {
	let entries;
	try {
		entries = fs.readdirSync(absDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (IGNORE_DIR_NAMES.has(entry.name)) {
			continue;
		}
		const absPath = path.join(absDir, entry.name);
		const relPath = path.join(relDir, entry.name);
		if (entry.isDirectory()) {
			walk(absPath, relPath, out);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			continue;
		}
		const posix = toPosix(relPath);
		if (!SRC_DIR_RE.test(posix) || isTestFile(posix)) {
			continue;
		}
		out.push(posix);
	}
}

export function formatReport(hits, fileCount) {
	const noun = hits.length === 1 ? "site" : "sites";
	const lines = [
		"CH5 console.* inventory (report only)",
		"",
		`population: ${fileCount} files (packages/**/src, tests excluded)`,
		`${hits.length} ${noun} under package src trees (tests excluded).`,
		"Workspace sweep is contested. Hits do not fail this inventory.",
	];

	if (hits.length === 0) {
		lines.push("");
		lines.push("No console.(log|warn|error|info|debug) sites.");
		return lines.join("\n");
	}

	lines.push("");
	for (const hit of hits) {
		lines.push(`${hit.file}:${hit.line}`);
	}

	return lines.join("\n");
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot };
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const files = [];
	walk(path.join(args.repoRoot, SCAN_ROOT), SCAN_ROOT, files);
	if (files.length === 0) {
		console.error(
			"console-inventory: cannot check: packages/**/src walk matched 0 files",
		);
		process.exitCode = 1;
		return;
	}
	const hits = collectConsoleHits(args.repoRoot);
	process.stdout.write(`${formatReport(hits, files.length)}\n`);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		const message =
			error instanceof Error ? (error.stack ?? error.message) : String(error);
		console.error(
			`console-inventory: cannot check: inventory failed to complete\n${message}`,
		);
		process.exitCode = 1;
	}
}
