#!/usr/bin/env node
/**
 * AX4 lint (spec-v2/13-accessibility.md, Wave X step X.5).
 *
 * Greps aria-hidden in packages/rendering runtime source. The attribute is
 * banned on visible content. Hits must be on the allowlist with a reason.
 * Sanctioned kinds: overlay layer (AX7) and the focus sink. Unmarked hits
 * and stale allowlist entries fail. This slice does not rewrite source.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join("scripts", "aria-hidden-allowlist.json");
const SCAN_ROOT = path.join("packages", "rendering");

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

const ARIA_HIDDEN_RE = /(?:["']aria-hidden["']|aria-hidden\s*=|\bariaHidden\b)/;

export function hitKey(entry) {
	return `${entry.file}:${entry.line}`;
}

export function parseAllowlist(raw, fileLabel) {
	const list = raw?.entries;
	if (!Array.isArray(list)) {
		throw new Error(`${fileLabel} must have an entries array`);
	}
	const seen = new Set();
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
		const parsed = {
			file: entry.file.split(path.sep).join(path.posix.sep),
			line: entry.line,
			reason: entry.reason.trim(),
		};
		const key = hitKey(parsed);
		if (seen.has(key)) {
			throw new Error(`${fileLabel} has a duplicate entry for ${key}`);
		}
		seen.add(key);
		return parsed;
	});
}

export function isTestFile(relPath) {
	const parts = relPath.split(path.posix.sep);
	if (parts.includes("__tests__")) {
		return true;
	}
	return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(parts[parts.length - 1]);
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

export function extractAriaHiddenHits(file, source) {
	const hits = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (isCommentLine(line) || !ARIA_HIDDEN_RE.test(line)) {
			continue;
		}
		hits.push({ file, line: index + 1 });
	}
	return hits;
}

export function evaluateAriaHiddenHits({ hits, allowlist }) {
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
		"AX4 no-aria-hidden-visible inventory",
		"",
		`${result.hits.length} hit(s) in packages/rendering runtime src.`,
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
			"FAIL aria-hidden on visible content (add an overlay / focus-sink allowlist reason, or remove the attribute):",
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

	if (!hasFailures(result)) {
		lines.push("");
		lines.push(
			`OK: ${result.hits.length} hit(s), ${result.allowed.length} allowlisted; every hit is overlay, focus sink, or a reasoned exception.`,
		);
	}

	return lines.join("\n");
}

export function formatStepSummary(result) {
	const lines = [
		"## AX4 no-aria-hidden-visible inventory",
		"",
		`${result.hits.length} hit(s) in \`packages/rendering\` runtime src.`,
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
			"**Result:** ok — no unmarked `aria-hidden` on visible content in rendering packages.",
		);
	}

	return `${lines.join("\n")}\n`;
}

export function runAX4Fixture() {
	const source = `<span aria-hidden="true">visible atom</span>\n`;
	const hits = extractAriaHiddenHits("tmp/ax4-fixture.tsx", source);
	if (hits.length !== 1 || hits[0].line !== 1) {
		throw new Error("AX4: expected the fixture aria-hidden to be extracted");
	}
	const result = evaluateAriaHiddenHits({ hits, allowlist: [] });
	if (!hasFailures(result) || result.unexpected.length !== 1) {
		throw new Error("AX4: expected aria-hidden on visible content in a temp string to fail the checker");
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
		const relPosix = path.relative(repoRoot, entryPath).split(path.sep).join(path.posix.sep);
		if (isTestFile(relPosix)) {
			continue;
		}
		files.push(entryPath);
	}
}

export async function collectAriaHiddenHits(repoRoot) {
	const files = [];
	await collectSourceFiles(path.join(repoRoot, SCAN_ROOT), repoRoot, files);
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		const relPosix = path.relative(repoRoot, filePath).split(path.sep).join(path.posix.sep);
		hits.push(...extractAriaHiddenHits(relPosix, text));
	}
	return hits;
}

async function loadAllowlist(repoRoot, relPath) {
	const text = await fs.readFile(path.join(repoRoot, relPath), "utf8");
	return parseAllowlist(JSON.parse(text), relPath);
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
	runAX4Fixture();
	console.log("AX4 fixture: aria-hidden on visible content in a temp string failed the checker.");

	const args = parseArgs(process.argv.slice(2));
	const hits = await collectAriaHiddenHits(args.repoRoot);
	const allowlist = await loadAllowlist(args.repoRoot, DEFAULT_ALLOWLIST);
	const result = evaluateAriaHiddenHits({ hits, allowlist });
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
