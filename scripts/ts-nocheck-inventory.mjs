#!/usr/bin/env node
/**
 * CH1 @ts-nocheck inventory (spec-v2/09-reliability-testing.md CH1,
 * Wave H step H.2).
 *
 * Lists every file under packages/ that still carries // @ts-nocheck.
 * Human-readable stdout. Always exits 0 — this is a burn-down report,
 * not a failing gate. H.2 removes the directive as each module is
 * reassembled.
 *
 *   node scripts/ts-nocheck-inventory.mjs
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
	"coverage",
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

const TS_NOCHECK_RE = /^\s*\/\/\s*@ts-nocheck\b/m;

export function hasTsNocheck(source) {
	return TS_NOCHECK_RE.test(source);
}

export function toPosix(relPath) {
	return relPath.split(path.sep).join(path.posix.sep);
}

export function collectTsNocheckFiles(repoRoot = DEFAULT_REPO_ROOT) {
	const files = [];
	walk(path.join(repoRoot, SCAN_ROOT), SCAN_ROOT, files);
	files.sort((left, right) => left.localeCompare(right));
	return files;
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
		let source;
		try {
			source = fs.readFileSync(absPath, "utf8");
		} catch {
			continue;
		}
		if (hasTsNocheck(source)) {
			out.push(toPosix(relPath));
		}
	}
}

function groupByDirectory(files) {
	const groups = new Map();
	for (const file of files) {
		const slash = file.lastIndexOf("/");
		const dir = slash === -1 ? "" : file.slice(0, slash + 1);
		const list = groups.get(dir) ?? [];
		list.push(file);
		groups.set(dir, list);
	}
	return [...groups.entries()].sort((left, right) =>
		left[0].localeCompare(right[0]),
	);
}

export function formatReport(files) {
	const noun = files.length === 1 ? "file" : "files";
	const lines = [
		"CH1 @ts-nocheck inventory (report only)",
		"",
		`${files.length} ${noun} under packages/ carry // @ts-nocheck.`,
		"H.2 burns this list down as each module is reassembled. This script never fails.",
	];

	if (files.length === 0) {
		lines.push("");
		lines.push("No // @ts-nocheck files under packages/.");
		return lines.join("\n");
	}

	lines.push("");
	lines.push("By directory:");
	for (const [dir, group] of groupByDirectory(files)) {
		lines.push(`  ${dir}  (${group.length})`);
	}

	lines.push("");
	lines.push("Files:");
	for (const file of files) {
		lines.push(`  ${file}`);
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
	const files = collectTsNocheckFiles(args.repoRoot);
	process.stdout.write(`${formatReport(files)}\n`);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		const message =
			error instanceof Error ? (error.stack ?? error.message) : String(error);
		process.stdout.write(
			`CH1 @ts-nocheck inventory (report only)\n\nInventory failed to complete:\n${message}\n`,
		);
	}
	process.exit(0);
}
