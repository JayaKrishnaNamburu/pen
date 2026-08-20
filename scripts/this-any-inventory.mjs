#!/usr/bin/env node
/**
 * CH4 `this: any` inventory (spec-v2/09-reliability-testing.md CH4,
 * Wave H step H.2).
 *
 * Greps `this: any` / `this:any` in every `.ts` file under `packages/` and
 * prints file:count.
 * Always exits 0 — this is a burn-down report, not a failing gate.
 * H.2 deletes the signatures as each mixin module is reassembled.
 *
 *   node scripts/this-any-inventory.mjs
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

/** `this: any` and `this:any` (optional whitespace after the colon). */
const THIS_ANY_RE = /this:\s*any\b/g;

export function countThisAny(source) {
	return [...source.matchAll(THIS_ANY_RE)].length;
}

export function toPosix(relPath) {
	return relPath.split(path.sep).join(path.posix.sep);
}

export function collectThisAnyHits(repoRoot = DEFAULT_REPO_ROOT) {
	const hits = [];
	walk(path.join(repoRoot, SCAN_ROOT), SCAN_ROOT, hits);
	hits.sort((left, right) => left.file.localeCompare(right.file));
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
		if (path.extname(entry.name) !== ".ts") {
			continue;
		}
		let source;
		try {
			source = fs.readFileSync(absPath, "utf8");
		} catch {
			continue;
		}
		const count = countThisAny(source);
		if (count > 0) {
			out.push({ file: toPosix(relPath), count });
		}
	}
}

export function formatReport(hits) {
	const total = hits.reduce((sum, hit) => sum + hit.count, 0);
	const fileNoun = hits.length === 1 ? "file" : "files";
	const lines = [
		"CH4 this: any inventory (report only)",
		"",
		`${total} hit(s) in ${hits.length} ${fileNoun} under packages/**/*.ts.`,
		"H.2 burns this list down as each mixin is reassembled. This script never fails.",
	];

	if (hits.length === 0) {
		lines.push("");
		lines.push("No this: any / this:any hits under packages/**/*.ts.");
		return lines.join("\n");
	}

	lines.push("");
	for (const hit of hits) {
		lines.push(`${hit.file}:${hit.count}`);
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
	const hits = collectThisAnyHits(args.repoRoot);
	process.stdout.write(`${formatReport(hits)}\n`);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		const message =
			error instanceof Error ? (error.stack ?? error.message) : String(error);
		process.stdout.write(
			`CH4 this: any inventory (report only)\n\nInventory failed to complete:\n${message}\n`,
		);
	}
	process.exit(0);
}
