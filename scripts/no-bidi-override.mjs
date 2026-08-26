#!/usr/bin/env node
/**
 * RI1 lint (spec/rules/dom.md, Wave 6 step 6.5).
 *
 * Greps packages/rendering (pen-dom / react / vue) for `bidi-override`,
 * including `unicode-bidi: bidi-override` on style objects. Marks and
 * decorations must not introduce override; isolate is the allowed value.
 *
 * Hits must be on the allowlist with a reason. Unmarked hits and stale
 * allowlist entries fail. Today's tree has no hits — do not add an
 * allowlist entry unless the site is justified.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join("scripts", "no-bidi-override-allowlist.json");

const SCAN_ROOT = "packages/rendering";
const BIDI_OVERRIDE_RE = /bidi-override/;
const UNICODE_BIDI_OVERRIDE_RE = /unicode-bidi:\s*bidi-override/;

const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".vue",
	".css",
	".mts",
	".cts",
]);

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

export function hitKey(entry) {
	return `${entry.file}:${entry.line}`;
}

export function matchKind(line) {
	if (UNICODE_BIDI_OVERRIDE_RE.test(line)) {
		return "unicode-bidi: bidi-override";
	}
	if (BIDI_OVERRIDE_RE.test(line)) {
		return "bidi-override";
	}
	return null;
}

export function parseAllowlist(raw, fileLabel) {
	if (raw == null) {
		return [];
	}
	const list = raw.entries;
	if (!Array.isArray(list)) {
		throw new Error(`${fileLabel} must have an entries array`);
	}
	return list.map((entry, index) => {
		if (
			typeof entry?.file !== "string" ||
			typeof entry?.line !== "number" ||
			!Number.isInteger(entry.line) ||
			entry.line < 1 ||
			typeof entry?.reason !== "string" ||
			entry.file.length === 0 ||
			entry.reason.trim().length === 0
		) {
			throw new Error(
				`${fileLabel} entries[${index}] needs file, a positive integer line, and a non-empty reason`,
			);
		}
		return {
			file: entry.file.split(path.sep).join(path.posix.sep),
			line: entry.line,
			reason: entry.reason.trim(),
		};
	});
}

export function extractHits(source, file) {
	const hits = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const kind = matchKind(lines[index]);
		if (kind == null) {
			continue;
		}
		hits.push({
			file,
			line: index + 1,
			kind,
		});
	}
	return hits;
}

export function evaluateHits({ hits, allowlist }) {
	const allowlistByKey = new Map(allowlist.map((entry) => [hitKey(entry), entry]));
	const hitKeys = new Set(hits.map(hitKey));

	const allowed = [];
	const unexpected = [];

	for (const hit of hits) {
		const allowedEntry = allowlistByKey.get(hitKey(hit));
		if (allowedEntry) {
			allowed.push({ ...hit, reason: allowedEntry.reason });
			continue;
		}
		unexpected.push(hit);
	}

	const staleAllowlist = allowlist.filter((entry) => !hitKeys.has(hitKey(entry)));

	return {
		hits,
		allowed,
		unexpected,
		staleAllowlist,
	};
}

export function hasFailures(result) {
	return result.unexpected.length > 0 || result.staleAllowlist.length > 0;
}

export function formatReport(result) {
	const lines = [
		"RI1 no-bidi-override inventory",
		"",
		`${result.hits.length} hit(s) in packages/rendering.`,
	];

	lines.push("");
	if (result.allowed.length === 0) {
		lines.push("Allowlisted: none");
	} else {
		lines.push(`Allowlisted (${result.allowed.length}):`);
		for (const entry of result.allowed) {
			lines.push(`  ${hitKey(entry)}  ${entry.kind}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unmarked bidi-override (remove it, or add an allowlist reason if justified):",
		);
		for (const entry of result.unexpected) {
			lines.push(`  ${hitKey(entry)}  ${entry.kind}`);
		}
	}

	if (result.staleAllowlist.length > 0) {
		lines.push("");
		lines.push("FAIL stale allowlist entries (no matching hit; remove them):");
		for (const entry of result.staleAllowlist) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (!hasFailures(result)) {
		lines.push("");
		lines.push(
			`OK: ${result.hits.length} hit(s), ${result.allowed.length} allowlisted; every hit is accounted for.`,
		);
	}

	return lines.join("\n");
}

export function formatStepSummary(result) {
	const lines = [
		"## RI1 no-bidi-override inventory",
		"",
		`${result.hits.length} hit(s) in \`packages/rendering\`.`,
		"",
		`**Allowlisted:** ${result.allowed.length}`,
	];

	lines.push("");
	lines.push("### Allowlisted");
	if (result.allowed.length === 0) {
		lines.push("");
		lines.push("_None._");
	} else {
		for (const entry of result.allowed) {
			lines.push(`- \`${hitKey(entry)}\` (\`${entry.kind}\`) — ${entry.reason}`);
		}
	}

	if (hasFailures(result)) {
		lines.push("");
		lines.push("**Result:** fail — unmarked hits or stale allowlist entries.");
	} else {
		lines.push("");
		lines.push(
			"**Result:** ok — no unmarked `unicode-bidi: bidi-override` / `bidi-override`.",
		);
	}

	return `${lines.join("\n")}\n`;
}

export function runRI1Fixture() {
	const overrideValue = ["bidi", "override"].join("-");
	const cssOverride = `unicode-bidi: ${overrideValue}`;
	const isolate = "unicode-bidi: isolate";
	const source = `${cssOverride}\ncolor: red;\n${isolate}\nunicodeBidi: "${overrideValue}";\n`;
	const hits = extractHits(source, "tmp/ri1-fixture.ts");
	if (hits.length !== 2) {
		throw new Error(
			`RI1: expected two fixture hits, got ${hits.length}: ${JSON.stringify(hits)}`,
		);
	}
	if (hits[0]?.kind !== "unicode-bidi: bidi-override") {
		throw new Error("RI1: expected unicode-bidi: bidi-override on the CSS line");
	}
	if (hits[1]?.kind !== "bidi-override") {
		throw new Error("RI1: expected bidi-override on the style-object line");
	}
	if (matchKind(isolate) != null) {
		throw new Error("RI1: unicode-bidi: isolate must not be a hit");
	}

	const unmarked = evaluateHits({ hits, allowlist: [] });
	if (!hasFailures(unmarked) || unmarked.unexpected.length !== 2) {
		throw new Error("RI1: expected unmarked fixture hits to fail the checker");
	}

	const allowed = evaluateHits({
		hits,
		allowlist: [
			{ file: "tmp/ri1-fixture.ts", line: 1, reason: "fixture" },
			{ file: "tmp/ri1-fixture.ts", line: 4, reason: "fixture" },
		],
	});
	if (hasFailures(allowed)) {
		throw new Error("RI1: justified allowlist entries must pass");
	}

	const stale = evaluateHits({
		hits: [],
		allowlist: [{ file: "tmp/ri1-fixture.ts", line: 1, reason: "gone" }],
	});
	if (!hasFailures(stale) || stale.staleAllowlist.length !== 1) {
		throw new Error("RI1: expected a stale allowlist entry to fail the checker");
	}
}

export async function runMissingRootSelfTest() {
	const missingRoot = path.join(os.tmpdir(), `pen-ri1-missing-${process.pid}`);
	try {
		await collectBidiOverrideHits(missingRoot);
		throw new Error("RI1: missing packages/rendering must fail closed");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!/missing packages\/rendering/.test(message)) {
			throw new Error(
				`RI1: missing scan root must fail by name, got ${message}`,
				{ cause: error },
			);
		}
	}
}

async function collectSourceFiles(directory, repoRoot, files) {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIR_NAMES.has(entry.name)) {
				await collectSourceFiles(entryPath, repoRoot, files);
			}
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			continue;
		}
		files.push(entryPath);
	}
}

export async function collectBidiOverrideHits(repoRoot) {
	const scanRoot = path.join(repoRoot, SCAN_ROOT);
	try {
		await fs.access(scanRoot);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			throw new Error(`RI1: missing ${SCAN_ROOT} (skip of nothing)`, {
				cause: error,
			});
		}
		throw error;
	}
	const files = [];
	await collectSourceFiles(scanRoot, repoRoot, files);
	if (files.length === 0) {
		throw new Error(
			`RI1: walker found zero source files under ${SCAN_ROOT} (skip of nothing)`,
		);
	}
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		const relPosix = path
			.relative(repoRoot, filePath)
			.split(path.sep)
			.join(path.posix.sep);
		hits.push(...extractHits(text, relPosix));
	}
	return { hits, fileCount: files.length };
}

async function loadAllowlist(repoRoot, relPath) {
	try {
		const text = await fs.readFile(path.join(repoRoot, relPath), "utf8");
		return parseAllowlist(JSON.parse(text), relPath);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let allowlistPath = DEFAULT_ALLOWLIST;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--allowlist") {
			allowlistPath = argv[i + 1] ?? "";
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, allowlistPath };
}

async function writeStepSummary(markdown) {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (!summaryPath) {
		return;
	}
	await fs.appendFile(summaryPath, markdown);
}

async function main() {
	runRI1Fixture();
	await runMissingRootSelfTest();
	console.log("RI1 fixture: bidi-override in a temp string failed the checker.");
	console.log("  red-proof: missing packages/rendering fails closed by name");

	const args = parseArgs(process.argv.slice(2));
	const { hits, fileCount } = await collectBidiOverrideHits(args.repoRoot);
	console.log(
		`population: ${fileCount} files (packages/rendering source)`,
	);
	const allowlist = await loadAllowlist(args.repoRoot, args.allowlistPath);
	const result = evaluateHits({ hits, allowlist });
	const report = formatReport(result);
	console.log(report);
	await writeStepSummary(formatStepSummary(result));
	if (hasFailures(result)) {
		process.exitCode = 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
