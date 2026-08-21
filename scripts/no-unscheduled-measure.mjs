#!/usr/bin/env node
/**
 * SCH1 lint (spec-v2/07-dom-scheduling.md, Wave 3 step 3.4).
 *
 * Greps getBoundingClientRect, getClientRects, elementFromPoint,
 * caretPositionFromPoint, and caretRangeFromPoint in packages/rendering
 * (same inventory as
 * `rg -n 'getBoundingClientRect|getClientRects|elementFromPoint|caretPositionFromPoint|caretRangeFromPoint' packages/rendering --glob '!*.test.*'`).
 * Comment-only lines are skipped so documentation of the ban is not an
 * allowlist entry. Hits must be on the allowlist keyed by file and
 * enclosing symbol, with a reason: the geometry module (SCH1 / G1 / G4)
 * or a justified pre-scheduler site. Unmarked hits and stale list
 * entries fail. This slice does not migrate call sites.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join(
	"scripts",
	"unscheduled-measure-allowlist.json",
);

const SCAN_ROOTS = [path.join("packages", "rendering")];

const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".vue",
]);
const TEST_FILE = /\.test\./;
const MEASURE_RE =
	/getBoundingClientRect|getClientRects|elementFromPoint|caretPositionFromPoint|caretRangeFromPoint/;

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

export function evaluateMeasureHits({ hits, allowlist }) {
	const allowlistByKey = new Map(
		allowlist.map((entry) => [hitKey(entry), entry]),
	);
	const hitKeys = new Set(hits.map(hitKey));
	const duplicateAllowlist = findDuplicateKeys(allowlist);

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

	const staleAllowlist = allowlist.filter(
		(entry) => !hitKeys.has(hitKey(entry)),
	);

	return {
		hits,
		allowed,
		unexpected,
		staleAllowlist,
		duplicateAllowlist,
	};
}

export function formatReport(result) {
	const lines = [
		"SCH1 no-unscheduled-measure inventory",
		"",
		`${result.hits.length} hit(s) in packages/rendering runtime src.`,
	];

	lines.push("");
	if (result.allowed.length === 0) {
		lines.push("Allowlisted: none");
	} else {
		lines.push(
			`Allowlisted (${result.allowed.length}) — geometry module or justified pre-scheduler site:`,
		);
		for (const entry of result.allowed) {
			lines.push(`  ${hitLocation(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unmarked measure (add an allowlist reason or move the call into a read phase / measureNow / geometry/):",
		);
		for (const entry of result.unexpected) {
			lines.push(`  ${hitLocation(entry)}`);
		}
	}

	if (result.staleAllowlist.length > 0) {
		lines.push("");
		lines.push(
			"FAIL stale allowlist entries (symbol not found in file; remove them):",
		);
		for (const entry of result.staleAllowlist) {
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
		"## SCH1 no-unscheduled-measure inventory",
		"",
		`${result.hits.length} hit(s) in \`packages/rendering\` runtime src.`,
		"",
		`**Allowlisted:** ${result.allowed.length}`,
	];

	lines.push("");
	lines.push("### Allowlisted (geometry / pre-scheduler)");
	if (result.allowed.length === 0) {
		lines.push("");
		lines.push("_None._");
	} else {
		for (const entry of result.allowed) {
			lines.push(`- \`${hitLocation(entry)}\` — ${entry.reason}`);
		}
	}

	if (hasFailures(result)) {
		lines.push("");
		lines.push(
			"**Result:** fail — unmarked hits or stale allowlist entries.",
		);
	} else {
		lines.push("");
		lines.push(
			"**Result:** ok — every hit is allowlisted. Geometry module (SCH1/G1/G4) and justified pre-scheduler sites stay; a new unmarked measure fails.",
		);
	}

	return `${lines.join("\n")}\n`;
}

export function hasFailures(result) {
	return (
		result.unexpected.length > 0 ||
		result.staleAllowlist.length > 0 ||
		result.duplicateAllowlist.length > 0
	);
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

export function extractMeasureHits(file, source) {
	const hits = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (isCommentLine(line)) {
			continue;
		}
		if (MEASURE_RE.test(line)) {
			hits.push({
				file,
				line: index + 1,
				symbol: resolveEnclosingSymbol(source, index + 1),
			});
		}
	}
	return hits;
}

export function runSCH1Fixture() {
	const api = ["get", "Bounding", "Client", "Rect"].join("");
	const source = `el.${api}();\n`;
	const hits = extractMeasureHits("tmp/sch1-fixture.ts", source);
	if (hits.length !== 1 || hits[0].line !== 1) {
		throw new Error("SCH1: expected the fixture measure to be extracted");
	}
	const unmarked = evaluateMeasureHits({ hits, allowlist: [] });
	if (!hasFailures(unmarked) || unmarked.unexpected.length !== 1) {
		throw new Error(
			`SCH1: expected ${api} in a temp string to fail the checker`,
		);
	}

	const namedSource = `function measureSite() {\n\tel.${api}();\n}\n`;
	const namedHits = extractMeasureHits("tmp/sch1-fixture.ts", namedSource);
	if (
		namedHits.length !== 1 ||
		namedHits[0].symbol !== "measureSite" ||
		namedHits[0].line !== 2
	) {
		throw new Error("SCH1: expected measureSite to enclose the fixture hit");
	}
	const allowed = evaluateMeasureHits({
		hits: namedHits,
		allowlist: [
			{
				file: "tmp/sch1-fixture.ts",
				symbol: "measureSite",
				reason: "fixture",
			},
		],
	});
	if (hasFailures(allowed)) {
		throw new Error("SCH1: expected a matching symbol to pass the checker");
	}

	const shiftedHits = extractMeasureHits(
		"tmp/sch1-fixture.ts",
		`\n${namedSource}`,
	);
	if (
		shiftedHits.length !== 1 ||
		shiftedHits[0].symbol !== "measureSite" ||
		shiftedHits[0].line !== 3
	) {
		throw new Error(
			"SCH1: expected a leading blank line to keep the enclosing symbol",
		);
	}
	const shifted = evaluateMeasureHits({
		hits: shiftedHits,
		allowlist: [
			{
				file: "tmp/sch1-fixture.ts",
				symbol: "measureSite",
				reason: "fixture",
			},
		],
	});
	if (hasFailures(shifted)) {
		throw new Error(
			"SCH1: expected a line shift above an allowlisted symbol to pass",
		);
	}

	const stale = evaluateMeasureHits({
		hits: namedHits,
		allowlist: [
			{
				file: "tmp/sch1-fixture.ts",
				symbol: "renamedSite",
				reason: "gone",
			},
		],
	});
	if (stale.staleAllowlist.length !== 1) {
		throw new Error(
			"SCH1: expected a stale allowlist symbol to fail the checker",
		);
	}
	const staleReport = formatReport(stale);
	if (
		!staleReport.includes("tmp/sch1-fixture.ts:renamedSite") ||
		!staleReport.includes("symbol not found in file")
	) {
		throw new Error(
			"SCH1: expected the stale report to name the missing symbol and file",
		);
	}
}

function isRuntimeSrc(relPosix) {
	if (!relPosix.startsWith("packages/rendering/")) {
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
		if (!SOURCE_EXTENSIONS.has(ext) || TEST_FILE.test(entry.name)) {
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

export async function collectMeasureHits(repoRoot) {
	const files = [];
	for (const relRoot of SCAN_ROOTS) {
		const absRoot = path.join(repoRoot, relRoot);
		await collectSourceFiles(absRoot, repoRoot, files);
	}
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		const relPosix = path
			.relative(repoRoot, filePath)
			.split(path.sep)
			.join(path.posix.sep);
		hits.push(...extractMeasureHits(relPosix, text));
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
	runSCH1Fixture();
	console.log(
		"SCH1 fixture: getBoundingClientRect in a temp string failed the checker.",
	);

	const args = parseArgs(process.argv.slice(2));
	const hits = await collectMeasureHits(args.repoRoot);
	const allowlist = await loadReasonedList(
		args.repoRoot,
		DEFAULT_ALLOWLIST,
		"entries",
	);
	const result = evaluateMeasureHits({ hits, allowlist });
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
