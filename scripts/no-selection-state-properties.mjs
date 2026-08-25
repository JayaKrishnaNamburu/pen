#!/usr/bin/env node
/**
 * Wave 5.1 selection-helper conversion (spec-v2/waves/wave-05-selection.md).
 *
 * Replaces the checkpoint `rg -n "\\.isCollapsed" packages --glob '!*.test.ts'`.
 * That command can never go empty without a false green: it matches the
 * browser Selection.isCollapsed, misses .isMultiBlock / .blockRange, and
 * treats [...blockRange] as a hit because the spread's final dot reads as
 * \\.blockRange.
 *
 * This scan matches only SelectionState-shaped receivers:
 *   editor.selection.isCollapsed
 *   sel.blockRange
 *   nextSelection.isMultiBlock
 * and rejects DocumentRange / snapshot / liveSelection / spread / method-call
 * sites. Path exclusions are an allowlist keyed by file + waived construct.
 * A missing file or a vanished construct fails.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join(
	"scripts",
	"selection-state-properties-allowlist.json",
);

const SCAN_ROOT = "packages";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const TEST_FILE = /\.(?:test|spec)\./;
const TEST_DIR = "__tests__";

/**
 * Re-derived against the 2026-08-21 tree, not adopted from a prior draft.
 *
 * Positive: a SelectionState receiver — `selection` / `sel` / `nextSelection`,
 * with an optional dotted prefix so `editor.selection.isCollapsed` still hits.
 * `(?<=\\.\\.\\.|[^.\\w$]|^)` starts the receiver after a spread, a
 * non-ident, or the line start — so `[...sel.blockRange]` (helpers.ts)
 * matches while `editor.selection.X` does not double-count from the
 * inner `selection.X`.
 * `(?!\\s*\\()` drops `isCollapsed()` method calls (conformance bridge).
 *
 * Negative (verified against known-present lines before trusting absence):
 *   range.blockRange / snapshot.blockRange / this.blockRange
 *   selectionSnapshot.blockRange / liveSelection.isCollapsed
 *   [...blockRange] (spread of a bare ident; no SelectionState receiver)
 */
export const SELECTION_STATE_PROP_RE =
	/(?<=\.\.\.|[^.\w$]|^)(?:\w+\??\.)*(?:selection|sel|nextSelection)\??\.(isCollapsed|isMultiBlock|blockRange)\b(?!\s*\()/g;

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

export function allowlistKey(entry) {
	return `${entry.file} :: ${entry.construct}`;
}

export function hitLocation(entry) {
	return `${entry.file}:${entry.line}`;
}

export function parseAllowlist(raw, fileLabel) {
	const list = raw?.entries;
	if (!Array.isArray(list)) {
		throw new Error(`${fileLabel} must have an entries array`);
	}
	return list.map((entry, index) => {
		if (
			typeof entry?.file !== "string" ||
			typeof entry?.construct !== "string" ||
			typeof entry?.reason !== "string" ||
			entry.file.length === 0 ||
			entry.construct.length === 0 ||
			entry.reason.trim().length === 0
		) {
			throw new Error(
				`${fileLabel} entries[${index}] needs file, construct, and a non-empty reason`,
			);
		}
		return {
			file: entry.file.split(path.sep).join(path.posix.sep),
			construct: entry.construct,
			reason: entry.reason.trim(),
		};
	});
}

export function isCommentLine(line) {
	const trimmed = line.trim();
	return (
		trimmed.startsWith("//") ||
		trimmed.startsWith("*") ||
		trimmed.startsWith("/*") ||
		trimmed.startsWith("{/*")
	);
}

export function extractHits(file, source) {
	const hits = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (isCommentLine(line)) {
			continue;
		}
		const matcher = new RegExp(
			SELECTION_STATE_PROP_RE.source,
			SELECTION_STATE_PROP_RE.flags,
		);
		for (const match of line.matchAll(matcher)) {
			hits.push({
				file,
				line: index + 1,
				text: line,
				symbol: match[1],
				matched: match[0],
			});
		}
	}
	return hits;
}

function findDuplicateKeys(entries) {
	const seen = new Set();
	const duplicates = [];
	for (const entry of entries) {
		const key = allowlistKey(entry);
		if (seen.has(key)) {
			duplicates.push(entry);
			continue;
		}
		seen.add(key);
	}
	return duplicates;
}

export function evaluateHits({ hits, allowlist, fileTexts }) {
	const texts = fileTexts ?? new Map();
	const duplicateAllowlist = findDuplicateKeys(allowlist);
	const allowed = [];
	const unexpected = [];

	for (const hit of hits) {
		const allowedEntry = allowlist.find(
			(entry) =>
				entry.file === hit.file && hit.text.includes(entry.construct),
		);
		if (allowedEntry) {
			allowed.push({ ...hit, reason: allowedEntry.reason });
			continue;
		}
		unexpected.push(hit);
	}

	const stalePaths = [];
	const staleConstructs = [];
	for (const entry of allowlist) {
		if (!texts.has(entry.file)) {
			stalePaths.push(entry);
			continue;
		}
		if (!texts.get(entry.file).includes(entry.construct)) {
			staleConstructs.push(entry);
		}
	}

	return {
		hits,
		allowed,
		unexpected,
		stalePaths,
		staleConstructs,
		duplicateAllowlist,
	};
}

export function hasFailures(result) {
	return (
		result.unexpected.length > 0 ||
		result.stalePaths.length > 0 ||
		result.staleConstructs.length > 0 ||
		result.duplicateAllowlist.length > 0
	);
}

export function formatReport(result) {
	const lines = [
		"Wave 5.1 no-selection-state-properties",
		"",
		`${result.hits.length} SelectionState property access(es) in packages runtime src.`,
	];

	lines.push("");
	if (result.allowed.length === 0) {
		lines.push("Allowlisted: none");
	} else {
		lines.push(`Allowlisted (${result.allowed.length}):`);
		for (const entry of result.allowed) {
			lines.push(`  ${hitLocation(entry)}  ${entry.matched}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unmarked SelectionState property access (convert to isCollapsed / isMultiBlock / getSelectionBlockRange, or justify the site):",
		);
		for (const entry of result.unexpected) {
			lines.push(`  ${hitLocation(entry)}  ${entry.matched}`);
		}
	}

	if (result.stalePaths.length > 0) {
		lines.push("");
		lines.push(
			"FAIL stale allowlist path (file no longer exists; remove the entry):",
		);
		for (const entry of result.stalePaths) {
			lines.push(`  ${allowlistKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.staleConstructs.length > 0) {
		lines.push("");
		lines.push(
			"FAIL stale allowlist construct (waived access gone from file; remove the entry):",
		);
		for (const entry of result.staleConstructs) {
			lines.push(`  ${allowlistKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.duplicateAllowlist.length > 0) {
		lines.push("");
		lines.push("FAIL duplicate allowlist entries:");
		for (const entry of result.duplicateAllowlist) {
			lines.push(`  ${allowlistKey(entry)}`);
		}
	}

	if (!hasFailures(result)) {
		lines.push("");
		lines.push(
			`OK: ${result.allowed.length} allowlisted; every hit is accounted for.`,
		);
	}

	return lines.join("\n");
}

export function formatStepSummary(result) {
	const lines = [
		"## Wave 5.1 no-selection-state-properties",
		"",
		`${result.hits.length} hit(s) in \`packages\` runtime src.`,
		"",
		`**Allowlisted:** ${result.allowed.length}`,
	];

	if (hasFailures(result)) {
		lines.push("");
		lines.push(
			"**Result:** fail — unmarked hits or a stale path/construct exclusion.",
		);
	} else {
		lines.push("");
		lines.push(
			"**Result:** ok — DocumentRange / snapshot / DOM / helper sites stay; a new `SelectionState` property access fails.",
		);
	}

	return `${lines.join("\n")}\n`;
}

export function runDirectionalProofs() {
	const failSource = [
		"function route(editor) {",
		"	return editor.selection.isCollapsed;",
		"}",
		"",
	].join("\n");
	const failHits = extractHits(
		"tmp/reintroduced-selection-state.ts",
		failSource,
	);
	const failResult = evaluateHits({
		hits: failHits,
		allowlist: [],
		fileTexts: new Map(),
	});
	const failReport = formatReport(failResult);
	if (
		!hasFailures(failResult) ||
		failResult.unexpected.length !== 1 ||
		failResult.unexpected[0]?.matched !== "editor.selection.isCollapsed"
	) {
		throw new Error(
			`expected editor.selection.isCollapsed to fail by name, got ${JSON.stringify(failResult.unexpected)}`,
		);
	}

	const passSource = [
		"const ids = range.blockRange;",
		"const snap = snapshot.blockRange;",
		"const chained = new DocumentRangeImpl(a, b, doc).blockRange;",
		"const spread = [...blockRange];",
		"if (window.__penConformance.isCollapsed()) {}",
		"if (liveSelection.isCollapsed) {}",
		"if (selectionSnapshot.blockRange.length) {}",
		"if (this.isMultiBlock) {}",
		"",
	].join("\n");
	const passHits = extractHits("tmp/legitimate-non-state.ts", passSource);
	const passResult = evaluateHits({
		hits: passHits,
		allowlist: [],
		fileTexts: new Map(),
	});
	const passReport = formatReport(passResult);
	if (hasFailures(passResult) || passHits.length !== 0) {
		throw new Error(
			`expected legitimate DocumentRange / DOM / helper sites to pass, got ${JSON.stringify(passHits)}`,
		);
	}

	const stalePath = evaluateHits({
		hits: [],
		allowlist: [
			{
				file: "packages/gone/missing.ts",
				construct: "selection.isCollapsed",
				reason: "removed file",
			},
		],
		fileTexts: new Map(),
	});
	if (stalePath.stalePaths.length !== 1) {
		throw new Error("expected a missing allowlist path to fail");
	}

	const staleConstruct = evaluateHits({
		hits: [],
		allowlist: [
			{
				file: "packages/core/src/selection/helpers.ts",
				construct: "sel.blockRange",
				reason: "stamp read",
			},
		],
		fileTexts: new Map([
			["packages/core/src/selection/helpers.ts", "export function isCollapsed() {}\n"],
		]),
	});
	if (staleConstruct.staleConstructs.length !== 1) {
		throw new Error("expected a vanished waived construct to fail");
	}

	return { failReport, passReport };
}

function isRuntimeSrc(relPosix) {
	if (!relPosix.startsWith("packages/")) {
		return false;
	}
	if (TEST_FILE.test(relPosix) || relPosix.includes(`/${TEST_DIR}/`)) {
		return false;
	}
	return /\/src\//.test(relPosix);
}

async function collectSourceFiles(directory, repoRoot, files) {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
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
		const ext = path.extname(entry.name);
		if (!SOURCE_EXTENSIONS.has(ext)) {
			continue;
		}
		const relPosix = path
			.relative(repoRoot, entryPath)
			.split(path.sep)
			.join(path.posix.sep);
		if (isRuntimeSrc(relPosix)) {
			files.push(entryPath);
		}
	}
}

export async function collectHits(repoRoot) {
	const scanRoot = path.join(repoRoot, SCAN_ROOT);
	try {
		await fs.access(scanRoot);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			throw new Error(`missing ${SCAN_ROOT} (skip of nothing)`, {
				cause: error,
			});
		}
		throw error;
	}

	const files = [];
	await collectSourceFiles(scanRoot, repoRoot, files);
	if (files.length === 0) {
		throw new Error(
			`walker found zero source files under ${SCAN_ROOT} (skip of nothing)`,
		);
	}
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	const fileTexts = new Map();
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		const relPosix = path
			.relative(repoRoot, filePath)
			.split(path.sep)
			.join(path.posix.sep);
		fileTexts.set(relPosix, text);
		hits.push(...extractHits(relPosix, text));
	}
	return { hits, fileTexts };
}

async function loadAllowlist(repoRoot, relPath) {
	const text = await fs.readFile(path.join(repoRoot, relPath), "utf8");
	return parseAllowlist(JSON.parse(text), relPath);
}

async function loadAllowlistFileTexts(repoRoot, allowlist, scannedTexts) {
	const texts = new Map(scannedTexts);
	for (const entry of allowlist) {
		if (texts.has(entry.file)) {
			continue;
		}
		try {
			const text = await fs.readFile(
				path.join(repoRoot, entry.file),
				"utf8",
			);
			texts.set(entry.file, text);
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				continue;
			}
			throw error;
		}
	}
	return texts;
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
	const proofs = runDirectionalProofs();
	console.log("FAIL proof (reintroduced editor.selection.isCollapsed):");
	console.log(proofs.failReport);
	console.log("");
	console.log("PASS proof (DocumentRange / snapshot / DOM / spread / method):");
	console.log(proofs.passReport);
	console.log("");

	const args = parseArgs(process.argv.slice(2));
	const { hits, fileTexts: scannedTexts } = await collectHits(args.repoRoot);
	console.log(
		`population: ${scannedTexts.size} files (packages source, tests excluded)`,
	);
	const allowlist = await loadAllowlist(args.repoRoot, args.allowlistPath);
	const fileTexts = await loadAllowlistFileTexts(
		args.repoRoot,
		allowlist,
		scannedTexts,
	);
	const result = evaluateHits({ hits, allowlist, fileTexts });
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
