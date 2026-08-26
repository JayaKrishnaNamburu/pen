#!/usr/bin/env node
/**
 * CH3 skip/todo hygiene (spec/rules/reliability.md CH3,
 * Wave H step H.3 / H.9).
 *
 * Greps `.skip` / `.todo` on describe/it/test in packages and playground
 * `*.test.ts` / `*.spec.ts` files. Playwright `test.skip(condition, reason)`
 * is a runtime filter, not a placeholder, and is ignored.
 * Every hit is reported. The gate fails only on an empty-bodied skip/todo
 * with no adjacent comment — the F10 placeholder shape
 * (`describe.skip("…", () => {})` and no note).
 *
 * A skip with a body, or an empty skip with a comment, is inventory.
 * If the live tree has more empty uncommented hits than
 * REPORT_ONLY_THRESHOLD, this script exits 0 and prints that an
 * allowlist should be seeded — it does not fail CI on a pile of
 * pre-existing debt. Today's tree is under that threshold, so a new
 * empty uncommented skip fails.
 *
 *   node scripts/skip-hygiene.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join("scripts", "skip-hygiene-allowlist.json");
const SCAN_ROOTS = ["packages", "playground", "internal"];

/** Empty uncommented hits above this count stay report-only (exit 0). */
export const REPORT_ONLY_THRESHOLD = 8;

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

const SKIP_CALL_RE =
	/\b(?:describe|it|test)(?:\.describe)?\.(skip|todo)\s*\(/g;

export function hitKey(entry) {
	return `${entry.file}:${entry.line}`;
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

export function extractSkipHits(source, file) {
	const hits = [];
	SKIP_CALL_RE.lastIndex = 0;
	let match;
	while ((match = SKIP_CALL_RE.exec(source))) {
		const openParen = match.index + match[0].length - 1;
		const callEnd = findBalancedEnd(source, openParen);
		if (callEnd < 0) {
			continue;
		}
		const call = source.slice(match.index, callEnd);
		if (isConditionalSkip(call)) {
			continue;
		}
		hits.push({
			file,
			line: offsetToLine(source, match.index),
			kind: match[1],
			callee: match[0].replace(/\s*\($/, ""),
			emptyBody: isEmptySkipBody(call, match[1]),
			hasComment: adjacentComment(source, match.index, callEnd).length > 0,
		});
	}
	return hits;
}

export function isConditionalSkip(call) {
	const open = call.indexOf("(");
	const close = call.lastIndexOf(")");
	if (open < 0 || close <= open) {
		return false;
	}
	const args = call.slice(open + 1, close).trim();
	// A skipped test names itself first; a runtime filter leads with the
	// condition, which Playwright also accepts as a predicate function.
	return args.length > 0 && !/^[`'"]/.test(args);
}

export function isEmptySkipBody(call, kind) {
	if (kind === "todo" && !/=>|function/.test(call)) {
		return true;
	}
	const block = skipCallbackBlock(call);
	if (block == null) {
		return !/=>/.test(call);
	}
	const stripped = block
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "")
		.trim();
	return stripped.length === 0;
}

export function isFailClass(hit) {
	return hit.emptyBody && !hit.hasComment;
}

export function evaluateSkipHits({ hits, allowlist, threshold = REPORT_ONLY_THRESHOLD }) {
	const allowlistByKey = new Map(allowlist.map((entry) => [hitKey(entry), entry]));
	const failHits = hits.filter(isFailClass);
	const failKeys = new Set(failHits.map(hitKey));

	const allowed = [];
	const unexpected = [];

	for (const hit of failHits) {
		const allowedEntry = allowlistByKey.get(hitKey(hit));
		if (allowedEntry) {
			allowed.push({ ...hit, reason: allowedEntry.reason });
			continue;
		}
		unexpected.push(hit);
	}

	const staleAllowlist = allowlist.filter((entry) => !failKeys.has(hitKey(entry)));
	const reportOnly = unexpected.length > threshold;

	return {
		hits,
		failHits,
		allowed,
		unexpected,
		staleAllowlist,
		reportOnly,
		threshold,
	};
}

export function hasFailures(result) {
	if (result.reportOnly) {
		return false;
	}
	return result.unexpected.length > 0 || result.staleAllowlist.length > 0;
}

export function formatReport(result) {
	const lines = [
		"CH3 skip/todo hygiene",
		"",
		`${result.hits.length} .skip/.todo hit(s) in packages/ and playground tests.`,
		`${result.failHits.length} empty-bodied without a comment (fail class).`,
	];

	lines.push("");
	if (result.hits.length === 0) {
		lines.push("Hits: none");
	} else {
		lines.push("Hits:");
		for (const hit of result.hits) {
			const flags = [
				hit.emptyBody ? "empty body" : "has body",
				hit.hasComment ? "comment" : "no comment",
			];
			if (isFailClass(hit)) {
				flags.push("fail-class");
			}
			lines.push(`  ${hitKey(hit)}  ${hit.callee}  (${flags.join(", ")})`);
		}
	}

	lines.push("");
	if (result.allowed.length === 0) {
		lines.push("Allowlisted fail-class: none");
	} else {
		lines.push(`Allowlisted fail-class (${result.allowed.length}):`);
		for (const entry of result.allowed) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		if (result.reportOnly) {
			lines.push(
				`REPORT-ONLY: ${result.unexpected.length} empty-bodied uncommented .skip/.todo (over threshold ${result.threshold}). Seed scripts/skip-hygiene-allowlist.json; not failing.`,
			);
		} else {
			lines.push(
				"FAIL empty-bodied .skip/.todo without a comment (add a body, a comment, or an allowlist reason):",
			);
		}
		for (const entry of result.unexpected) {
			lines.push(`  ${hitKey(entry)}  ${entry.callee}`);
		}
	}

	if (result.staleAllowlist.length > 0 && !result.reportOnly) {
		lines.push("");
		lines.push("FAIL stale allowlist entries (no matching fail-class hit; remove them):");
		for (const entry of result.staleAllowlist) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (!hasFailures(result) && !result.reportOnly) {
		lines.push("");
		lines.push(
			`OK: ${result.hits.length} hit(s), ${result.failHits.length} fail-class, ${result.allowed.length} allowlisted; no empty uncommented skip/todo.`,
		);
	}

	return lines.join("\n");
}

export function formatStepSummary(result) {
	const lines = [
		"## CH3 skip/todo hygiene",
		"",
		`${result.hits.length} \`.skip\` / \`.todo\` hit(s) in packages and playground tests.`,
		"",
		`**Fail-class (empty body, no comment):** ${result.failHits.length}`,
		`**Allowlisted:** ${result.allowed.length}`,
	];

	lines.push("");
	lines.push("### Hits");
	if (result.hits.length === 0) {
		lines.push("");
		lines.push("_None._");
	} else {
		for (const hit of result.hits) {
			const note = isFailClass(hit)
				? "empty, no comment"
				: hit.emptyBody
					? "empty, commented"
					: "has body";
			lines.push(`- \`${hitKey(hit)}\` — \`${hit.callee}\` (${note})`);
		}
	}

	if (result.reportOnly) {
		lines.push("");
		lines.push(
			`**Result:** report-only — ${result.unexpected.length} empty uncommented hits over threshold ${result.threshold}. Seed an allowlist.`,
		);
	} else if (hasFailures(result)) {
		lines.push("");
		lines.push("**Result:** fail — empty-bodied skip/todo without a comment.");
	} else {
		lines.push("");
		lines.push(
			"**Result:** ok — fail-class is empty or allowlisted. New empty uncommented `.skip` / `.todo` fails.",
		);
	}

	return `${lines.join("\n")}\n`;
}

export function runCH3Fixture() {
	const skipCall = ["describe", "skip"].join(".");
	const todoCall = ["it", "todo"].join(".");
	const emptyUncommented = `${skipCall}("placeholder", () => {});\n`;
	const emptyCommented = `// F10 Wave H restore after de-mixin\n${skipCall}("placeholder", () => {});\n`;
	const bodied = `${skipCall}("SCALE4 soak", () => {\n\tit("asserts heap", () => {});\n});\n`;
	const todoBare = `${todoCall}("later");\n`;
	const falsePositive = `const name = "test.skip-combine";\n`;
	const conditional =
		`test.skip(browserName === "webkit", "Wave 5 owns WebKit triple-click");\n`;
	const conditionalPredicate =
		`test.skip(({ browserName }) => browserName !== "chromium", "HOST4 needs Chromium host-resolver rules");\n`;

	const emptyHits = extractSkipHits(emptyUncommented, "tmp/ch3-empty.test.ts");
	if (emptyHits.length !== 1 || !isFailClass(emptyHits[0])) {
		throw new Error("CH3: empty uncommented describe.skip must be fail-class");
	}

	const commentedHits = extractSkipHits(emptyCommented, "tmp/ch3-comment.test.ts");
	if (commentedHits.length !== 1 || isFailClass(commentedHits[0])) {
		throw new Error("CH3: empty skip with a comment must not be fail-class");
	}

	const bodiedHits = extractSkipHits(bodied, "tmp/ch3-body.test.ts");
	if (bodiedHits.length !== 1 || isFailClass(bodiedHits[0])) {
		throw new Error("CH3: skip with a body must not be fail-class");
	}

	const todoHits = extractSkipHits(todoBare, "tmp/ch3-todo.test.ts");
	if (todoHits.length !== 1 || !isFailClass(todoHits[0])) {
		throw new Error("CH3: bare it.todo without a comment must be fail-class");
	}

	if (extractSkipHits(falsePositive, "tmp/ch3-name.test.ts").length !== 0) {
		throw new Error("CH3: test.skip-combine in a string must not be a hit");
	}

	if (extractSkipHits(conditional, "tmp/ch3-conditional.spec.ts").length !== 0) {
		throw new Error("CH3: Playwright test.skip(condition, reason) must not be a hit");
	}

	if (
		extractSkipHits(conditionalPredicate, "tmp/ch3-predicate.spec.ts").length !== 0
	) {
		throw new Error(
			"CH3: Playwright test.skip(predicate, reason) must not be a hit",
		);
	}

	const unmarked = evaluateSkipHits({
		hits: emptyHits,
		allowlist: [],
		threshold: REPORT_ONLY_THRESHOLD,
	});
	if (!hasFailures(unmarked) || unmarked.unexpected.length !== 1) {
		throw new Error("CH3: expected empty uncommented skip to fail the checker");
	}

	const overThreshold = evaluateSkipHits({
		hits: Array.from({ length: REPORT_ONLY_THRESHOLD + 1 }, (_, index) => ({
			...emptyHits[0],
			file: `tmp/ch3-debt-${index}.test.ts`,
			line: 1,
		})),
		allowlist: [],
		threshold: REPORT_ONLY_THRESHOLD,
	});
	if (!overThreshold.reportOnly || hasFailures(overThreshold)) {
		throw new Error("CH3: hits over the threshold must be report-only");
	}

	const allowed = evaluateSkipHits({
		hits: emptyHits,
		allowlist: [{ file: "tmp/ch3-empty.test.ts", line: 1, reason: "fixture" }],
	});
	if (hasFailures(allowed)) {
		throw new Error("CH3: allowlisted fail-class must pass");
	}
}

function skipCallbackBlock(call) {
	const paren = call.indexOf("(");
	if (paren < 0) {
		return null;
	}
	const afterOpen = call.slice(paren);
	const arrow = afterOpen.indexOf("=>");
	const fn = afterOpen.indexOf("function");
	let startKeyword = -1;
	if (arrow >= 0 && (fn < 0 || arrow < fn)) {
		startKeyword = arrow;
	} else if (fn >= 0) {
		startKeyword = fn;
	}
	if (startKeyword < 0) {
		return null;
	}
	const brace = afterOpen.indexOf("{", startKeyword);
	if (brace < 0) {
		return null;
	}
	const end = findBalancedEnd(afterOpen, brace);
	if (end < 0) {
		return null;
	}
	return afterOpen.slice(brace + 1, end - 1);
}

function adjacentComment(source, startIndex, callEnd) {
	const leading = leadingComments(source, startIndex);
	const trailing = trailingComment(source, callEnd);
	return `${leading}\n${trailing}`.trim();
}

function leadingComments(source, index) {
	const lines = source.slice(0, index).split("\n");
	const collected = [];
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const trimmed = lines[i].trim();
		if (trimmed === "") {
			if (collected.length > 0) {
				break;
			}
			continue;
		}
		if (
			trimmed.startsWith("//") ||
			trimmed.startsWith("/*") ||
			trimmed.startsWith("*") ||
			trimmed.endsWith("*/")
		) {
			collected.unshift(lines[i]);
			continue;
		}
		break;
	}
	return collected.join("\n");
}

function trailingComment(source, index) {
	const lineEnd = source.indexOf("\n", index);
	const rest = source.slice(index, lineEnd === -1 ? source.length : lineEnd);
	const comment = rest.match(/\/\/.*$/);
	return comment ? comment[0] : "";
}

function findBalancedEnd(source, openIndex) {
	const open = source[openIndex];
	const close = open === "(" ? ")" : open === "{" ? "}" : null;
	if (!close) {
		return -1;
	}
	let depth = 0;
	let quote = null;
	for (let i = openIndex; i < source.length; i += 1) {
		const ch = source[i];
		if (quote) {
			if (ch === "\\" && quote !== "`") {
				i += 1;
				continue;
			}
			if (ch === quote) {
				quote = null;
			}
			continue;
		}
		if (ch === "'" || ch === '"' || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "/" && source[i + 1] === "/") {
			i = source.indexOf("\n", i);
			if (i < 0) {
				return -1;
			}
			continue;
		}
		if (ch === "/" && source[i + 1] === "*") {
			i = source.indexOf("*/", i + 2);
			if (i < 0) {
				return -1;
			}
			i += 1;
			continue;
		}
		if (ch === open) {
			depth += 1;
		} else if (ch === close) {
			depth -= 1;
			if (depth === 0) {
				return i + 1;
			}
		}
	}
	return -1;
}

function offsetToLine(source, offset) {
	let line = 1;
	for (let i = 0; i < offset; i += 1) {
		if (source[i] === "\n") {
			line += 1;
		}
	}
	return line;
}

function isTestTs(relPosix) {
	return relPosix.endsWith(".test.ts") || relPosix.endsWith(".spec.ts");
}

async function collectTestFiles(directory, repoRoot, files) {
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
				await collectTestFiles(entryPath, repoRoot, files);
			}
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		const relPosix = path
			.relative(repoRoot, entryPath)
			.split(path.sep)
			.join(path.posix.sep);
		if (isTestTs(relPosix)) {
			files.push(entryPath);
		}
	}
}

export async function collectSkipHits(repoRoot) {
	const files = [];
	for (const root of SCAN_ROOTS) {
		await collectTestFiles(path.join(repoRoot, root), repoRoot, files);
	}
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		const relPosix = path
			.relative(repoRoot, filePath)
			.split(path.sep)
			.join(path.posix.sep);
		hits.push(...extractSkipHits(text, relPosix));
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
	runCH3Fixture();
	console.log(
		"CH3 fixture: empty uncommented describe.skip in a temp string failed the checker.",
	);

	const args = parseArgs(process.argv.slice(2));
	const { hits, fileCount } = await collectSkipHits(args.repoRoot);
	if (fileCount === 0) {
		console.error(
			"skip-hygiene: cannot check: packages+playground+internal *.test.ts/*.spec.ts walk matched 0 files",
		);
		process.exitCode = 1;
		return;
	}
	console.log(
		`population: ${fileCount} files (packages+playground+internal *.test.ts/*.spec.ts)`,
	);
	const allowlist = await loadAllowlist(args.repoRoot, args.allowlistPath);
	const result = evaluateSkipHits({ hits, allowlist });
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
