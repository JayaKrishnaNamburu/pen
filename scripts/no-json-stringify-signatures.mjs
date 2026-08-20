#!/usr/bin/env node
/**
 * SCALE2 lint (spec-v2/22-scale-envelope.md, Wave F step F.2).
 *
 * Greps JSON.stringify in packages/rendering and packages/core runtime src
 * (tests excluded). Wire-format / display / clone / diagnostic sites must be
 * on scripts/json-stringify-allowlist.json with a reason. Change-detection
 * suspects live on scripts/json-stringify-deferred.json and are reported
 * without failing. Unmarked hits and stale list entries fail.
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

export function hitKey(entry) {
	return `${entry.file}:${entry.line}`;
}

export function parseReasonedList(raw, fieldName, fileLabel) {
	const list = raw?.[fieldName];
	if (!Array.isArray(list)) {
		throw new Error(`${fileLabel} must have a ${fieldName} array`);
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
				`${fileLabel} ${fieldName}[${index}] needs file, a positive integer line, and a non-empty reason`,
			);
		}
		return {
			file: entry.file.split(path.sep).join(path.posix.sep),
			line: entry.line,
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
			lines.push(`  ${hitKey(entry)}`);
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
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unmarked JSON.stringify (add an allowlist reason or defer a change-detection suspect):",
		);
		for (const entry of result.unexpected) {
			lines.push(`  ${hitKey(entry)}`);
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

	if (result.staleDeferred.length > 0) {
		lines.push("");
		lines.push("FAIL stale deferred entries (no matching hit; remove them):");
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
			lines.push(`- \`${hitKey(entry)}\` — ${entry.reason}`);
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
			lines.push(`- \`${hitKey(entry)}\` — ${entry.reason}`);
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

export function extractStringifyHits(source) {
	const hits = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		if (!lines[index].includes(STRINGIFY_NEEDLE)) {
			continue;
		}
		hits.push({ line: index + 1 });
	}
	return hits;
}

export function runSCALE2Fixture() {
	const call = ["JSON", "stringify"].join(".");
	const source = `export const signature = ${call}(value);\n`;
	const extracted = extractStringifyHits(source);
	if (extracted.length !== 1 || extracted[0].line !== 1) {
		throw new Error("SCALE2: expected the fixture stringify call to be extracted");
	}
	const hit = {
		file: "tmp/scale2-fixture.ts",
		line: extracted[0].line,
	};
	const result = evaluateStringifyHits({
		hits: [hit],
		allowlist: [],
		deferred: [],
	});
	if (!hasFailures(result) || result.unexpected.length !== 1) {
		throw new Error(`SCALE2: expected ${call} in a temp string to fail the checker`);
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
		for (const extracted of extractStringifyHits(text)) {
			hits.push({
				file: relPosix,
				line: extracted.line,
			});
		}
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
