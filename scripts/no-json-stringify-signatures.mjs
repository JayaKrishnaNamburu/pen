#!/usr/bin/env node
/**
 * SCALE2 lint (spec-v2/22-scale-envelope.md, Wave F step F.2).
 *
 * Greps JSON.stringify in packages/rendering and packages/core runtime src
 * (tests excluded). Wire-format / display / clone / diagnostic sites must be
 * on scripts/json-stringify-allowlist.json keyed by file and enclosing
 * symbol, with a reason. Change-detection suspects live on
 * scripts/json-stringify-deferred.json and are reported without failing.
 * Unmarked hits and stale list entries fail.
 *
 * This slice does not rewrite call sites.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join("scripts", "json-stringify-allowlist.json");
const DEFAULT_DEFERRED = path.join("scripts", "json-stringify-deferred.json");

const SCAN_ROOTS = ["packages/rendering", "packages/core"];
const STRINGIFY_NEEDLE = "JSON.stringify";
const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".vue",
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
	"__tests__",
]);

export const MODULE_SYMBOL = "<module>";

export function hitKey(entry) {
	return `${entry.file}:${entry.symbol}`;
}

export function hitLocation(entry) {
	if (typeof entry.line === "number") {
		return `${hitKey(entry)} (line ${entry.line})`;
	}
	return hitKey(entry);
}

function isCommentLine(line) {
	const trimmed = line.trim();
	return (
		trimmed.startsWith("//") ||
		trimmed.startsWith("*") ||
		trimmed.startsWith("/*") ||
		trimmed.startsWith("{/*")
	);
}

function isTopLevel(line) {
	return line.length > 0 && line[0] !== " " && line[0] !== "\t";
}

function stripNoise(line) {
	return line
		.replace(/\/\/.*$/, "")
		.replace(/\/\*.*?\*\//g, "")
		.replace(/'(?:\\.|[^'\\])*'/g, "''")
		.replace(/"(?:\\.|[^"\\])*"/g, '""')
		.replace(/`(?:\\.|[^`\\])*`/g, "``");
}

function countBraces(line) {
	let close = 0;
	let open = 0;
	for (const ch of stripNoise(line)) {
		if (ch === "}") {
			close += 1;
		} else if (ch === "{") {
			open += 1;
		}
	}
	return { close, open };
}

export function matchDeclaration(line) {
	const trimmed = line.trim();
	if (!trimmed || isCommentLine(line)) {
		return null;
	}

	let match = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(
		trimmed,
	);
	if (match) {
		return match[1];
	}

	match = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(
		trimmed,
	);
	if (match) {
		return match[1];
	}

	if (!isTopLevel(line)) {
		return null;
	}

	match =
		/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\(|(?:React\.)?(?:memo|forwardRef|observer)\s*\()/.exec(
			trimmed,
		);
	return match ? match[1] : null;
}

export function resolveEnclosingSymbol(source, lineNumber) {
	const lines = source.split(/\r?\n/);
	const hitIndex = lineNumber - 1;
	if (hitIndex < 0 || hitIndex >= lines.length) {
		return MODULE_SYMBOL;
	}

	const onHit = matchDeclaration(lines[hitIndex]);
	if (onHit) {
		return onHit;
	}

	let depth = 0;
	for (let index = hitIndex - 1; index >= 0; index -= 1) {
		const name = matchDeclaration(lines[index]);
		if (name && depth === 0) {
			return name;
		}
		const { close, open } = countBraces(lines[index]);
		depth += close;
		if (depth > 0) {
			depth = Math.max(0, depth - open);
		}
	}
	return MODULE_SYMBOL;
}

export function parseReasonedList(raw, fieldName, fileLabel) {
	const list = raw?.[fieldName];
	if (!Array.isArray(list)) {
		throw new Error(`${fileLabel} must have a ${fieldName} array`);
	}
	return list.map((entry, index) => {
		if (
			typeof entry?.file !== "string" ||
			typeof entry?.symbol !== "string" ||
			typeof entry?.reason !== "string" ||
			entry.file.length === 0 ||
			entry.symbol.trim().length === 0 ||
			entry.reason.trim().length === 0
		) {
			throw new Error(
				`${fileLabel} ${fieldName}[${index}] needs file, enclosing symbol, and a non-empty reason`,
			);
		}
		return {
			file: entry.file.split(path.sep).join(path.posix.sep),
			symbol: entry.symbol.trim(),
			reason: entry.reason.trim(),
		};
	});
}

export function evaluateStringifyHits({ hits, allowlist, deferred }) {
	const allowlistByKey = new Map(allowlist.map((entry) => [hitKey(entry), entry]));
	const deferredByKey = new Map(deferred.map((entry) => [hitKey(entry), entry]));
	const hitKeys = new Set(hits.map(hitKey));

	const duplicateAllowlist = findDuplicateKeys(allowlist);
	const duplicateDeferred = findDuplicateKeys(deferred);
	const listedInBoth = allowlist.filter((entry) => deferredByKey.has(hitKey(entry)));

	const allowed = [];
	const deferredHits = [];
	const unexpected = [];

	for (const hit of hits) {
		const key = hitKey(hit);
		const allowedEntry = allowlistByKey.get(key);
		const deferredEntry = deferredByKey.get(key);
		if (allowedEntry && deferredEntry) {
			continue;
		}
		if (allowedEntry) {
			allowed.push({ ...hit, reason: allowedEntry.reason });
			continue;
		}
		if (deferredEntry) {
			deferredHits.push({ ...hit, reason: deferredEntry.reason });
			continue;
		}
		unexpected.push(hit);
	}

	const staleAllowlist = allowlist.filter((entry) => !hitKeys.has(hitKey(entry)));
	const staleDeferred = deferred.filter((entry) => !hitKeys.has(hitKey(entry)));

	return {
		hits,
		allowed,
		deferredHits,
		unexpected,
		staleAllowlist,
		staleDeferred,
		duplicateAllowlist,
		duplicateDeferred,
		listedInBoth,
	};
}

function findDuplicateKeys(entries) {
	const seen = new Set();
	const duplicates = [];
	for (const entry of entries) {
		const key = hitKey(entry);
		if (seen.has(key)) {
			duplicates.push(entry);
			continue;
		}
		seen.add(key);
	}
	return duplicates;
}

export function formatReport(result) {
	const lines = [
		"SCALE2 JSON.stringify inventory",
		"",
		`${result.hits.length} hit(s) in packages/rendering + packages/core runtime src.`,
	];

	lines.push("");
	if (result.allowed.length === 0) {
		lines.push("Allowlisted: none");
	} else {
		lines.push(`Allowlisted (${result.allowed.length}):`);
		for (const entry of result.allowed) {
			lines.push(`  ${hitLocation(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	lines.push("");
	if (result.deferredHits.length === 0) {
		lines.push("Deferred change-detection suspects: none");
	} else {
		lines.push(
			`Deferred change-detection suspects (${result.deferredHits.length}; report only):`,
		);
		for (const entry of result.deferredHits) {
			lines.push(`  ${hitLocation(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unmarked JSON.stringify (add an allowlist reason or defer a change-detection suspect):",
		);
		for (const entry of result.unexpected) {
			lines.push(`  ${hitLocation(entry)}`);
		}
	}

	if (result.staleAllowlist.length > 0) {
		lines.push("");
		lines.push("FAIL stale allowlist entries (symbol not found in file; remove them):");
		for (const entry of result.staleAllowlist) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.staleDeferred.length > 0) {
		lines.push("");
		lines.push("FAIL stale deferred entries (symbol not found in file; remove them):");
		for (const entry of result.staleDeferred) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.duplicateAllowlist.length > 0) {
		lines.push("");
		lines.push("FAIL duplicate allowlist entries:");
		for (const entry of result.duplicateAllowlist) {
			lines.push(`  ${hitKey(entry)}`);
		}
	}

	if (result.duplicateDeferred.length > 0) {
		lines.push("");
		lines.push("FAIL duplicate deferred entries:");
		for (const entry of result.duplicateDeferred) {
			lines.push(`  ${hitKey(entry)}`);
		}
	}

	if (result.listedInBoth.length > 0) {
		lines.push("");
		lines.push("FAIL entries listed on both the allowlist and the deferred list:");
		for (const entry of result.listedInBoth) {
			lines.push(`  ${hitKey(entry)}`);
		}
	}

	if (!hasFailures(result)) {
		lines.push("");
		lines.push(
			`OK: ${result.hits.length} hit(s), ${result.allowed.length} allowlisted, ${result.deferredHits.length} deferred; every hit is accounted for.`,
		);
	}

	return lines.join("\n");
}

export function formatStepSummary(result) {
	const lines = [
		"## SCALE2 JSON.stringify inventory",
		"",
		`${result.hits.length} hit(s) in \`packages/rendering\` and \`packages/core\` runtime src.`,
		"",
		`**Allowlisted:** ${result.allowed.length}`,
		`**Deferred (report only):** ${result.deferredHits.length}`,
	];

	lines.push("");
	lines.push("### Allowlisted");
	if (result.allowed.length === 0) {
		lines.push("");
		lines.push("_None._");
	} else {
		for (const entry of result.allowed) {
			lines.push(`- \`${hitLocation(entry)}\` — ${entry.reason}`);
		}
	}

	lines.push("");
	lines.push("### Deferred change-detection suspects");
	if (result.deferredHits.length === 0) {
		lines.push("");
		lines.push("_None._");
	} else {
		lines.push("");
		lines.push("These do not fail the job. Wave 2 owns replacing per-render / decoration signatures.");
		for (const entry of result.deferredHits) {
			lines.push(`- \`${hitLocation(entry)}\` — ${entry.reason}`);
		}
	}

	if (hasFailures(result)) {
		lines.push("");
		lines.push("**Result:** fail — unmarked hits or stale list entries.");
	} else {
		lines.push("");
		lines.push(
			"**Result:** ok — every `JSON.stringify` is allowlisted or deferred.",
		);
	}

	return `${lines.join("\n")}\n`;
}

export function hasFailures(result) {
	return (
		result.unexpected.length > 0 ||
		result.staleAllowlist.length > 0 ||
		result.staleDeferred.length > 0 ||
		result.duplicateAllowlist.length > 0 ||
		result.duplicateDeferred.length > 0 ||
		result.listedInBoth.length > 0
	);
}

export function extractStringifyHits(file, source) {
	const hits = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		if (!lines[index].includes(STRINGIFY_NEEDLE)) {
			continue;
		}
		hits.push({
			file,
			line: index + 1,
			symbol: resolveEnclosingSymbol(source, index + 1),
		});
	}
	return hits;
}

export function runSCALE2Fixture() {
	const call = ["JSON", "stringify"].join(".");
	const source = `export const signature = ${call}(value);\n`;
	const hits = extractStringifyHits("tmp/scale2-fixture.ts", source);
	if (hits.length !== 1 || hits[0].line !== 1) {
		throw new Error("SCALE2: expected the fixture stringify call to be extracted");
	}
	const unmarked = evaluateStringifyHits({
		hits,
		allowlist: [],
		deferred: [],
	});
	if (!hasFailures(unmarked) || unmarked.unexpected.length !== 1) {
		throw new Error(`SCALE2: expected ${call} in a temp string to fail the checker`);
	}

	const namedSource = `function serializeSite() {\n\treturn ${call}(value);\n}\n`;
	const namedHits = extractStringifyHits("tmp/scale2-fixture.ts", namedSource);
	if (
		namedHits.length !== 1 ||
		namedHits[0].symbol !== "serializeSite" ||
		namedHits[0].line !== 2
	) {
		throw new Error("SCALE2: expected serializeSite to enclose the fixture hit");
	}
	const allowed = evaluateStringifyHits({
		hits: namedHits,
		allowlist: [
			{
				file: "tmp/scale2-fixture.ts",
				symbol: "serializeSite",
				reason: "fixture",
			},
		],
		deferred: [],
	});
	if (hasFailures(allowed)) {
		throw new Error("SCALE2: expected a matching symbol to pass the checker");
	}

	const shiftedHits = extractStringifyHits(
		"tmp/scale2-fixture.ts",
		`\n${namedSource}`,
	);
	if (
		shiftedHits.length !== 1 ||
		shiftedHits[0].symbol !== "serializeSite" ||
		shiftedHits[0].line !== 3
	) {
		throw new Error(
			"SCALE2: expected a leading blank line to keep the enclosing symbol",
		);
	}
	const shifted = evaluateStringifyHits({
		hits: shiftedHits,
		allowlist: [
			{
				file: "tmp/scale2-fixture.ts",
				symbol: "serializeSite",
				reason: "fixture",
			},
		],
		deferred: [],
	});
	if (hasFailures(shifted)) {
		throw new Error(
			"SCALE2: expected a line shift above an allowlisted symbol to pass",
		);
	}

	const stale = evaluateStringifyHits({
		hits: namedHits,
		allowlist: [
			{
				file: "tmp/scale2-fixture.ts",
				symbol: "renamedSite",
				reason: "gone",
			},
		],
		deferred: [],
	});
	if (stale.staleAllowlist.length !== 1) {
		throw new Error("SCALE2: expected a stale allowlist symbol to fail the checker");
	}
	const staleReport = formatReport(stale);
	if (
		!staleReport.includes("tmp/scale2-fixture.ts:renamedSite") ||
		!staleReport.includes("symbol not found in file")
	) {
		throw new Error(
			"SCALE2: expected the stale report to name the missing symbol and file",
		);
	}
}

function isTestFile(relPosix) {
	const parts = relPosix.split("/");
	if (parts.includes("__tests__")) {
		return true;
	}
	return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(parts[parts.length - 1]);
}

function isRuntimeSrc(relPosix) {
	return relPosix.split("/").includes("src");
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
		const relPosix = path
			.relative(repoRoot, entryPath)
			.split(path.sep)
			.join(path.posix.sep);
		if (!isRuntimeSrc(relPosix) || isTestFile(relPosix)) {
			continue;
		}
		files.push(entryPath);
	}
}

export async function collectStringifyHits(repoRoot) {
	const files = [];
	for (const relRoot of SCAN_ROOTS) {
		await collectSourceFiles(path.join(repoRoot, relRoot), repoRoot, files);
	}
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		const relPosix = path
			.relative(repoRoot, filePath)
			.split(path.sep)
			.join(path.posix.sep);
		hits.push(...extractStringifyHits(relPosix, text));
	}
	return hits;
}

async function loadReasonedList(repoRoot, relPath, fieldName) {
	const text = await fs.readFile(path.join(repoRoot, relPath), "utf8");
	return parseReasonedList(JSON.parse(text), fieldName, relPath);
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
	runSCALE2Fixture();
	console.log("SCALE2 fixture: JSON.stringify in a temp string failed the checker.");

	const args = parseArgs(process.argv.slice(2));
	const hits = await collectStringifyHits(args.repoRoot);
	const allowlist = await loadReasonedList(
		args.repoRoot,
		DEFAULT_ALLOWLIST,
		"entries",
	);
	const deferred = await loadReasonedList(
		args.repoRoot,
		DEFAULT_DEFERRED,
		"entries",
	);
	const result = evaluateStringifyHits({ hits, allowlist, deferred });
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
