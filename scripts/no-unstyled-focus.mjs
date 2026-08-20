#!/usr/bin/env node
/**
 * AX5 lint (spec-v2/13-accessibility.md, Wave X step X.6).
 *
 * Greps `outline: none` / `outline:none` (and quoted JS style-object forms)
 * in packages/rendering/**. A hit is allowed only when a `:focus-visible`
 * replacement (a non-none `outline`) appears nearby in the same file, or
 * when the line is on scripts/unstyled-focus-allowlist.json with a reason.
 *
 * Unmarked hits and stale allowlist entries fail. This slice does not
 * rewrite CSS — other agents own component source.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join("scripts", "unstyled-focus-allowlist.json");
const SCAN_ROOT = path.join("packages", "rendering");
const NEARBY_RADIUS = 24;

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

const HIT_RE = /outline:\s*(?:none\b|["']none["'])/g;
const FOCUS_VISIBLE_RE = /:focus-visible\b/;
const OUTLINE_VALUE_RE = /outline:\s*(?:["']([^"']+)["']|([^;,\n}]+))/g;

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

export function parseAllowlist(raw, fileLabel = DEFAULT_ALLOWLIST) {
	const list = raw?.entries;
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

export function stripLineComment(line) {
	const index = line.indexOf("//");
	if (index === -1) {
		return line;
	}
	return line.slice(0, index);
}

export function lineHasOutlineNone(line) {
	HIT_RE.lastIndex = 0;
	return HIT_RE.test(stripLineComment(line));
}

export function outlineValueIsNone(value) {
	return /^\s*none\b/.test(value.trim());
}

export function hasFocusVisibleReplacement(lines, hitIndex, radius = NEARBY_RADIUS) {
	const start = Math.max(0, hitIndex - radius);
	const end = Math.min(lines.length, hitIndex + radius + 1);
	const windowText = lines.slice(start, end).join("\n");
	if (!FOCUS_VISIBLE_RE.test(windowText)) {
		return false;
	}

	OUTLINE_VALUE_RE.lastIndex = 0;
	for (const match of windowText.matchAll(OUTLINE_VALUE_RE)) {
		const value = (match[1] ?? match[2] ?? "").trim();
		if (value.length > 0 && !outlineValueIsNone(value)) {
			return true;
		}
	}
	return false;
}

export function extractUnstyledFocusHits(source, file) {
	const lines = source.split(/\r?\n/);
	const hits = [];
	for (let index = 0; index < lines.length; index += 1) {
		if (!lineHasOutlineNone(lines[index])) {
			continue;
		}
		if (hasFocusVisibleReplacement(lines, index)) {
			continue;
		}
		hits.push({
			file,
			line: index + 1,
			text: lines[index].trim(),
		});
	}
	return hits;
}

export function evaluateUnstyledFocusHits({ hits, allowlist }) {
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
		"AX5 no-unstyled-focus inventory",
		"",
		`${result.hits.length} unreplaced outline:none hit(s) in packages/rendering.`,
	];

	lines.push("");
	if (result.allowed.length === 0) {
		lines.push("Allowlisted: none");
	} else {
		lines.push(`Allowlisted (${result.allowed.length}):`);
		for (const entry of result.allowed) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unmarked outline:none without a nearby :focus-visible replacement (add an allowlist reason or restore a focus ring):",
		);
		for (const entry of result.unexpected) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.text}`);
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
		"## AX5 no-unstyled-focus inventory",
		"",
		`${result.hits.length} unreplaced \`outline: none\` hit(s) in \`packages/rendering\`.`,
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
			lines.push(`- \`${hitKey(entry)}\` — ${entry.reason}`);
		}
	}

	if (hasFailures(result)) {
		lines.push("");
		lines.push("**Result:** fail — unmarked hits or stale allowlist entries.");
	} else {
		lines.push("");
		lines.push(
			"**Result:** ok — every `outline: none` has a nearby `:focus-visible` replacement or an allowlist reason.",
		);
	}

	return `${lines.join("\n")}\n`;
}

export function runAX5Fixture() {
	const bare = "button { outline: none; }\n";
	const packed = "button{outline:none}\n";
	const quoted = 'const style = { outline: "none" };\n';
	const replaced = [
		"button { outline: none; }",
		"button:focus-visible { outline: 2px solid currentColor; }",
		"",
	].join("\n");
	const focusVisibleNone = "button:focus-visible { outline: none; }\n";

	const bareHits = extractUnstyledFocusHits(bare, "tmp/ax5-bare.css");
	if (bareHits.length !== 1 || bareHits[0].line !== 1) {
		throw new Error("AX5: expected outline: none in a temp string to fail the checker");
	}

	const packedHits = extractUnstyledFocusHits(packed, "tmp/ax5-packed.css");
	if (packedHits.length !== 1) {
		throw new Error("AX5: expected outline:none in a temp string to fail the checker");
	}

	const quotedHits = extractUnstyledFocusHits(quoted, "tmp/ax5-quoted.ts");
	if (quotedHits.length !== 1) {
		throw new Error('AX5: expected outline: "none" in a temp string to fail the checker');
	}

	const replacedHits = extractUnstyledFocusHits(replaced, "tmp/ax5-replaced.css");
	if (replacedHits.length !== 0) {
		throw new Error("AX5: nearby :focus-visible outline replacement must not be a hit");
	}

	const noneOnFocus = extractUnstyledFocusHits(
		focusVisibleNone,
		"tmp/ax5-focus-none.css",
	);
	if (noneOnFocus.length !== 1) {
		throw new Error("AX5: :focus-visible { outline: none } is not a replacement");
	}

	const allowlisted = evaluateUnstyledFocusHits({
		hits: bareHits,
		allowlist: [
			{
				file: "tmp/ax5-bare.css",
				line: 1,
				reason: "fixture — existing hit deferred",
			},
		],
	});
	if (hasFailures(allowlisted) || allowlisted.allowed.length !== 1) {
		throw new Error("AX5: matching allowlist entry must not fail the checker");
	}

	const stale = evaluateUnstyledFocusHits({
		hits: [],
		allowlist: [
			{
				file: "tmp/gone.css",
				line: 4,
				reason: "stale fixture",
			},
		],
	});
	if (!hasFailures(stale) || stale.staleAllowlist.length !== 1) {
		throw new Error("AX5: stale allowlist entry must fail the checker");
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

export async function collectUnstyledFocusHits(repoRoot) {
	const files = [];
	await collectSourceFiles(path.join(repoRoot, SCAN_ROOT), repoRoot, files);
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		const relPosix = path
			.relative(repoRoot, filePath)
			.split(path.sep)
			.join(path.posix.sep);
		hits.push(...extractUnstyledFocusHits(text, relPosix));
	}
	return hits;
}

async function loadAllowlist(repoRoot, relPath = DEFAULT_ALLOWLIST) {
	const allowlistPath = path.join(repoRoot, relPath);
	try {
		const text = await fs.readFile(allowlistPath, "utf8");
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

async function writeStepSummary(markdown) {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (!summaryPath) {
		return;
	}
	await fs.appendFile(summaryPath, markdown);
}

async function main() {
	runAX5Fixture();
	console.log("AX5 fixture: outline: none in a temp string failed the checker.");

	const args = parseArgs(process.argv.slice(2));
	const hits = await collectUnstyledFocusHits(args.repoRoot);
	const allowlist = await loadAllowlist(args.repoRoot);
	const result = evaluateUnstyledFocusHits({ hits, allowlist });
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
