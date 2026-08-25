#!/usr/bin/env node
/**
 * I15 instrument-path integrity (spec-v4/00-concept.md, spec-v4/02-instruments.md GA1).
 *
 * I15: every path-shaped datum in a check instrument — allowlist entries,
 * lint-target globs, sink lists, coverage claims — must resolve against
 * the tree. A merge or deletion that orphans an instrument path fails
 * in the same PR, not at the next hand audit.
 *
 * This checker validates the closed GA1 list (corrected 2026-08-25):
 *   - 16 named allowlist/data files under scripts/
 *   - path-bearing top-level constants in ch-gates.mjs (sink paths)
 *     and migration-guide-check.mjs (fidelity/exporter and guide/origin
 *     paths); api-docs-coverage.mjs is visited for named modules when
 *     they are paths (today: none — identifiers stay out)
 *   - lint-target `files:` globs in eslint.config.mjs
 *
 * Out of scope: `.size-limit.baseline.json`. All 24 entries live under
 * package `dist` trees and exist only after a build. `size-limit.mjs`
 * already fails closed on missing artifacts and carries that red-proof.
 * Re-validating them here duplicates a fail-closed check and invents a
 * false-red in the no-build static job — the defect class I15 exists
 * to end. Build-output presence is not "an instrument points at deleted
 * source."
 *
 * A listed path must exist. A glob must match ≥ 1 file, or carry an
 * adjacent `// I15-zero: <why>` comment stating why empty is intended
 * (ban-globs targeting files that must not exist are legitimate;
 * silence is not). A zero-marker on a glob that now matches is stale
 * and fails. Zero extracted claims fails closed — this check exists
 * to catch green-over-nothing.
 *
 * Deliberately does not validate identifier-shaped entries: rule IDs,
 * export names, package names, symbol names, and bare-basename matcher
 * patterns (`caretPositions.ts`). Those belong to other gates. When a
 * field's shape is ambiguous (has `/` but no repo-root prefix and is
 * not a `**` lint glob), it is skipped and listed, not failed.
 *
 * Scope list is closed in spec-v4/02-instruments.md GA1. Regenerate by
 * auditing:
 *   rg --files scripts --glob '*.json' --glob '*.txt'
 *   and path-bearing constants in scripts/*.mjs and eslint.config.mjs
 *   (do not add .size-limit.baseline.json — build artifacts, not source)
 *
 *   node scripts/instrument-paths.mjs
 *   node scripts/instrument-paths.mjs --self-test
 */

import { globSync } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_DIR = path.join(SCRIPT_DIR, "__fixtures__", "instrument-paths");

const ALLOWLIST_FILES = [
	"scripts/no-new-slots-allowlist.json",
	"scripts/pen-deep-imports-allowlist.json",
	"scripts/renderer-framework-free-allowlist.json",
	"scripts/selection-state-properties-allowlist.json",
	"scripts/unscheduled-measure-allowlist.json",
	"scripts/bidi-override-allowlist.json",
	"scripts/json-stringify-allowlist.json",
	"scripts/json-stringify-deferred.json",
	"scripts/workspace-pins-allowlist.json",
	"scripts/above-floor-api-allowlist.json",
	"scripts/published-exports-allowlist.json",
	"scripts/readme-sections-allowlist.json",
	"scripts/types-runtime-allowlist.json",
	"scripts/dag-allowlist.json",
	"scripts/flake-allowlist.json",
	"scripts/ch-nocheck-allowlist.txt",
];

const SCRIPT_CONSTANT_FILES = [
	"scripts/ch-gates.mjs",
	"scripts/migration-guide-check.mjs",
	"scripts/api-docs-coverage.mjs",
];

const ESLINT_REL = "eslint.config.mjs";

const REPO_PREFIX_RE =
	/^(?:packages|scripts|spec(?:-v[234])?|playground|internal|\.github|\.cursor|waves)\//;

const ZERO_MARKER_RE = /\/\/\s*I15-zero:\s*(\S.*)/;
const GLOB_CHAR_RE = /[*?[{]/;
const SKIP_WALK_NAMES = new Set(["node_modules", ".git", ".turbo"]);

export const CANNOT_CHECK_EMPTY =
	"cannot check: instrument-path walk matched 0 path-shaped claims";

export function parseArgs(argv, repoRoot = DEFAULT_REPO_ROOT) {
	let root = repoRoot;
	let selfTest = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--self-test") {
			selfTest = true;
			continue;
		}
		if (arg === "--repo-root") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --repo-root");
			}
			root = path.resolve(value);
			i += 1;
			continue;
		}
		if (arg.startsWith("--")) {
			throw new Error(`unknown flag ${arg}`);
		}
		throw new Error(`unexpected argument ${arg}`);
	}
	return { repoRoot: root, selfTest };
}

export function isRepoRelativePath(value) {
	if (typeof value !== "string" || value.length === 0) {
		return false;
	}
	const normalized = value.split(path.sep).join(path.posix.sep);
	return REPO_PREFIX_RE.test(normalized);
}

export function isLintTargetGlob(value) {
	if (typeof value !== "string" || value.length === 0) {
		return false;
	}
	const normalized = value.split(path.sep).join(path.posix.sep);
	if (isRepoRelativePath(normalized)) {
		return true;
	}
	return normalized.startsWith("**/") || normalized.startsWith("*/");
}

export function isExportMapKey(value) {
	return typeof value === "string" && value.startsWith("./");
}

export function isPackageName(value) {
	return typeof value === "string" && value.startsWith("@");
}

export function isPathShaped(value) {
	return isRepoRelativePath(value);
}

const PROSE_OR_IDENT_KEYS = new Set([
	"reason",
	"note",
	"comment",
	"fallback",
	"degradation",
	"construct",
	"symbol",
	"api",
	"name",
	"kind",
	"package",
	"key",
	"from",
	"to",
	"issue",
	"wave",
	"polarity",
]);

export function isAmbiguousPath(value) {
	if (typeof value !== "string" || value.length === 0) {
		return false;
	}
	if (/\s/.test(value)) {
		return false;
	}
	if (value.startsWith("node:") || value.startsWith("http:") || value.startsWith("https:")) {
		return false;
	}
	if (isPathShaped(value) || isLintTargetGlob(value)) {
		return false;
	}
	if (isPackageName(value) || isExportMapKey(value)) {
		return false;
	}
	return value.includes("/") || GLOB_CHAR_RE.test(value);
}

export function isGlobPattern(value) {
	return typeof value === "string" && GLOB_CHAR_RE.test(value);
}

function extractZeroReason(text) {
	const match = String(text ?? "").match(ZERO_MARKER_RE);
	if (!match) {
		return null;
	}
	return match[1].trim();
}

function skipLineComment(source, index) {
	const end = source.indexOf("\n", index);
	return end === -1 ? source.length : end + 1;
}

function skipBlockComment(source, index) {
	const end = source.indexOf("*/", index + 2);
	return end === -1 ? source.length : end + 2;
}

function readQuoted(source, index) {
	const quote = source[index];
	let i = index + 1;
	let value = "";
	while (i < source.length) {
		const ch = source[i];
		if (ch === "\\") {
			value += source[i + 1] ?? "";
			i += 2;
			continue;
		}
		if (ch === quote) {
			return { value, end: i + 1 };
		}
		value += ch;
		i += 1;
	}
	return { value, end: source.length };
}

function isIdentChar(ch) {
	return /[A-Za-z0-9_$]/.test(ch);
}

const TOP_LEVEL_CONST_RE =
	/^(?:export\s+)?const\s+[A-Za-z_][A-Za-z0-9_]*\s*=/gm;

export function collectTopLevelPathStrings(source, rel) {
	const claims = [];
	TOP_LEVEL_CONST_RE.lastIndex = 0;
	let match = TOP_LEVEL_CONST_RE.exec(source);
	while (match) {
		let i = match.index + match[0].length;
		while (i < source.length && /\s/.test(source[i])) {
			i += 1;
		}
		if (source[i] === "/") {
			match = TOP_LEVEL_CONST_RE.exec(source);
			continue;
		}
		for (const value of collectQuotedStringsInStatement(source, i)) {
			if (isPathShaped(value)) {
				claims.push({
					source: rel,
					kind: "script-constant",
					path: value,
					zeroReason: null,
					trail: rel,
				});
			} else if (isAmbiguousPath(value)) {
				claims.push({
					source: rel,
					kind: "ambiguous",
					path: value,
					zeroReason: null,
					trail: rel,
				});
			}
		}
		match = TOP_LEVEL_CONST_RE.exec(source);
	}
	return claims;
}

function collectQuotedStringsInStatement(source, start) {
	const values = [];
	let i = start;
	let depth = 0;
	while (i < source.length) {
		if (source.startsWith("//", i)) {
			i = skipLineComment(source, i);
			continue;
		}
		if (source.startsWith("/*", i)) {
			i = skipBlockComment(source, i);
			continue;
		}
		if (source[i] === "'" || source[i] === '"') {
			const read = readQuoted(source, i);
			values.push(read.value);
			i = read.end;
			continue;
		}
		if (source[i] === "(" || source[i] === "[") {
			depth += 1;
			i += 1;
			continue;
		}
		if (source[i] === ")" || source[i] === "]") {
			depth = Math.max(0, depth - 1);
			i += 1;
			continue;
		}
		if (source[i] === ";" && depth === 0) {
			break;
		}
		i += 1;
	}
	return values;
}

export function extractEslintLintTargets(source, rel = ESLINT_REL) {
	const claims = [];
	const skipped = [];
	let i = 0;
	while (i < source.length) {
		if (source.startsWith("//", i)) {
			i = skipLineComment(source, i);
			continue;
		}
		if (source.startsWith("/*", i)) {
			i = skipBlockComment(source, i);
			continue;
		}
		if (source[i] === "'" || source[i] === '"') {
			i = readQuoted(source, i).end;
			continue;
		}
		if (
			source.startsWith("files", i) &&
			(i === 0 || !isIdentChar(source[i - 1])) &&
			!isIdentChar(source[i + 5] ?? "")
		) {
			let j = i + 5;
			while (j < source.length && /\s/.test(source[j])) {
				j += 1;
			}
			if (source[j] === ":") {
				j += 1;
				while (j < source.length && /\s/.test(source[j])) {
					j += 1;
				}
				if (source[j] === "[") {
					const parsed = parseStringArray(source, j);
					for (const item of parsed.strings) {
						if (isLintTargetGlob(item.value)) {
							claims.push({
								source: rel,
								kind: "eslint-glob",
								path: item.value,
								zeroReason: item.zeroReason,
								trail: `${rel} files`,
							});
						} else if (isAmbiguousPath(item.value)) {
							skipped.push({
								value: item.value,
								trail: `${rel} files`,
								reason: "ambiguous, not validated",
							});
						}
					}
					i = parsed.end;
					continue;
				}
			}
		}
		i += 1;
	}
	return { claims, skipped };
}

function parseStringArray(source, openIndex) {
	const strings = [];
	let i = openIndex + 1;
	let pending = "";
	while (i < source.length) {
		if (source.startsWith("//", i)) {
			const end = source.indexOf("\n", i);
			const stop = end === -1 ? source.length : end;
			pending += `${source.slice(i, stop)}\n`;
			i = end === -1 ? source.length : end + 1;
			continue;
		}
		if (source.startsWith("/*", i)) {
			const end = skipBlockComment(source, i);
			pending += source.slice(i, end);
			i = end;
			continue;
		}
		if (source[i] === "'" || source[i] === '"') {
			const read = readQuoted(source, i);
			const lineEnd = source.indexOf("\n", read.end);
			const trail = source.slice(
				read.end,
				lineEnd === -1 ? source.length : lineEnd,
			);
			strings.push({
				value: read.value,
				zeroReason: extractZeroReason(`${pending}\n${trail}`),
			});
			pending = "";
			i = read.end;
			continue;
		}
		if (source[i] === "]") {
			return { strings, end: i + 1 };
		}
		if (source[i] === "[" || source[i] === "{") {
			i += 1;
			continue;
		}
		i += 1;
	}
	return { strings, end: source.length };
}

function walkJsonForPaths(value, trail, claims, skipped) {
	if (typeof value === "string") {
		if (isPathShaped(value)) {
			claims.push({
				source: trail.split(/[.[]/, 1)[0],
				kind: "allowlist",
				path: value,
				zeroReason: null,
				trail,
			});
			return;
		}
		if (isAmbiguousPath(value)) {
			skipped.push({
				value,
				trail,
				reason: "ambiguous, not validated",
			});
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			walkJsonForPaths(item, `${trail}[${index}]`, claims, skipped);
		});
		return;
	}
	if (value && typeof value === "object") {
		for (const [key, child] of Object.entries(value)) {
			if (key.startsWith("_") || PROSE_OR_IDENT_KEYS.has(key)) {
				continue;
			}
			walkJsonForPaths(child, `${trail}.${key}`, claims, skipped);
		}
	}
}

function readAllowlistClaims(repoRoot, rel, skipped) {
	const abs = path.join(repoRoot, rel);
	if (!fs.existsSync(abs)) {
		return {
			claims: [],
			error: `missing instrument file ${rel}`,
		};
	}
	const text = fs.readFileSync(abs, "utf8");
	if (rel.endsWith(".txt")) {
		const claims = [];
		for (const [index, raw] of text.split(/\r?\n/).entries()) {
			const line = raw.trim();
			if (!line || line.startsWith("#")) {
				continue;
			}
			if (isPathShaped(line)) {
				claims.push({
					source: rel,
					kind: "allowlist",
					path: line,
					zeroReason: null,
					trail: `${rel}:${index + 1}`,
				});
			} else if (isAmbiguousPath(line)) {
				skipped.push({
					value: line,
					trail: `${rel}:${index + 1}`,
					reason: "ambiguous, not validated",
				});
			}
		}
		return { claims, error: null };
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return {
			claims: [],
			error: `unreadable instrument file ${rel}: ${error instanceof Error ? error.message : error}`,
		};
	}
	const claims = [];
	walkJsonForPaths(parsed, rel, claims, skipped);
	for (const claim of claims) {
		claim.source = rel;
	}
	return { claims, error: null };
}

function expandGlob(repoRoot, pattern) {
	try {
		return globSync(pattern, {
			cwd: repoRoot,
			exclude: (name) => SKIP_WALK_NAMES.has(name),
		});
	} catch {
		return [];
	}
}

export function evaluateClaim(claim, repoRoot) {
	const rel = claim.path.split(path.sep).join(path.posix.sep);
	if (isGlobPattern(rel)) {
		const matches = expandGlob(repoRoot, rel);
		if (matches.length === 0) {
			if (claim.zeroReason) {
				return { status: "ok", matches: 0 };
			}
			return {
				status: "empty-glob",
				matches: 0,
				message: `glob ${rel} matched 0 files (unmarked; add // I15-zero: <why> if empty is intended)`,
			};
		}
		if (claim.zeroReason) {
			return {
				status: "stale-zero",
				matches: matches.length,
				message: `glob ${rel} carries // I15-zero: but matched ${matches.length} file(s)`,
			};
		}
		return { status: "ok", matches: matches.length };
	}
	const abs = path.join(repoRoot, rel);
	const exists = fs.existsSync(abs);
	if (!exists) {
		if (claim.zeroReason) {
			return { status: "ok", matches: 0 };
		}
		return {
			status: "missing",
			matches: 0,
			message: `${rel} does not exist`,
		};
	}
	if (claim.zeroReason) {
		return {
			status: "stale-zero",
			matches: 1,
			message: `${rel} carries // I15-zero: but exists`,
		};
	}
	return { status: "ok", matches: 1 };
}

export function checkInstrumentPaths(repoRoot) {
	const claims = [];
	const skipped = [];
	const errors = [];
	const visited = [];

	for (const rel of ALLOWLIST_FILES) {
		visited.push(rel);
		const result = readAllowlistClaims(repoRoot, rel, skipped);
		if (result.error) {
			errors.push(result.error);
			continue;
		}
		claims.push(...result.claims);
	}

	for (const rel of SCRIPT_CONSTANT_FILES) {
		visited.push(rel);
		const abs = path.join(repoRoot, rel);
		if (!fs.existsSync(abs)) {
			errors.push(`missing instrument file ${rel}`);
			continue;
		}
		const extracted = collectTopLevelPathStrings(
			fs.readFileSync(abs, "utf8"),
			rel,
		);
		for (const claim of extracted) {
			if (claim.kind === "ambiguous") {
				skipped.push({
					value: claim.path,
					trail: claim.trail,
					reason: "ambiguous, not validated",
				});
				continue;
			}
			claims.push(claim);
		}
	}

	visited.push(ESLINT_REL);
	const eslintAbs = path.join(repoRoot, ESLINT_REL);
	if (!fs.existsSync(eslintAbs)) {
		errors.push(`missing instrument file ${ESLINT_REL}`);
	} else {
		const eslint = extractEslintLintTargets(
			fs.readFileSync(eslintAbs, "utf8"),
			ESLINT_REL,
		);
		claims.push(...eslint.claims);
		skipped.push(...eslint.skipped);
	}

	const findings = [];
	for (const error of errors) {
		findings.push({
			status: "error",
			source: null,
			path: null,
			message: error,
		});
	}
	for (const claim of claims) {
		const result = evaluateClaim(claim, repoRoot);
		if (result.status === "ok") {
			continue;
		}
		findings.push({
			status: result.status,
			source: claim.source,
			path: claim.path,
			trail: claim.trail,
			message: result.message,
		});
	}

	const counts = {
		allowlist: claims.filter((claim) => claim.kind === "allowlist").length,
		script: claims.filter((claim) => claim.kind === "script-constant")
			.length,
		eslint: claims.filter((claim) => claim.kind === "eslint-glob").length,
	};
	if (claims.length === 0 && errors.length === 0) {
		findings.push({
			status: "empty",
			source: null,
			path: null,
			message: CANNOT_CHECK_EMPTY,
		});
	}

	return {
		ok: findings.length === 0,
		claims,
		findings,
		skipped,
		visited,
		counts,
		repoRoot,
	};
}

export function formatReport(run) {
	const total =
		run.counts.allowlist + run.counts.script + run.counts.eslint;
	const lines = [
		"I15 instrument-path integrity",
		"",
		`population: ${total} path claims (${run.counts.allowlist} allowlist, ${run.counts.script} script-constant, ${run.counts.eslint} eslint-glob)`,
		`visited: ${run.visited.length} instrument files`,
		"skipped: identifier-shaped entries (rule IDs, export names, package names, basename matchers)",
	];
	if (run.skipped.length > 0) {
		lines.push(`ambiguous, not validated: ${run.skipped.length}`);
		for (const item of run.skipped) {
			lines.push(`  ${item.trail}  ${item.value}`);
		}
	}
	if (run.findings.length > 0) {
		lines.push("");
		for (const finding of run.findings) {
			const where = finding.trail ?? finding.source ?? "instrument";
			lines.push(`FAIL ${where}`);
			lines.push(`  ${finding.message}`);
		}
		lines.push("");
		lines.push(`I15 FAIL (${run.findings.length} findings)`);
	} else {
		lines.push("");
		lines.push("I15 ok");
	}
	return lines.join("\n");
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function emptyAllowlistBodies() {
	return {
		"scripts/no-new-slots-allowlist.json": {
			exportedSlots: [],
			setSlotFiles: [],
		},
		"scripts/pen-deep-imports-allowlist.json": { entries: [] },
		"scripts/renderer-framework-free-allowlist.json": { modules: [] },
		"scripts/selection-state-properties-allowlist.json": { entries: [] },
		"scripts/unscheduled-measure-allowlist.json": { entries: [] },
		"scripts/bidi-override-allowlist.json": { entries: [] },
		"scripts/json-stringify-allowlist.json": { entries: [] },
		"scripts/json-stringify-deferred.json": { entries: [] },
		"scripts/workspace-pins-allowlist.json": {
			workspaceStar: [],
			jsArtifacts: [],
		},
		"scripts/above-floor-api-allowlist.json": { apis: [] },
		"scripts/published-exports-allowlist.json": {
			entries: [
				{
					package: "@input/pen-dom",
					key: "./field-editor/clipboard",
					reason: "identifier: export-map key, not a repo path",
				},
			],
		},
		"scripts/readme-sections-allowlist.json": { packages: [] },
		"scripts/types-runtime-allowlist.json": {
			entries: [
				{
					name: "generateId",
					kind: "function",
					reason: "identifier: export name",
				},
			],
		},
		"scripts/dag-allowlist.json": {
			inversions: [
				{
					from: "@input/pen-react",
					to: "@input/pen-ai",
					reason: "identifier: package names",
				},
			],
		},
		"scripts/flake-allowlist.json": {
			tests: [{ name: "caretPositions.ts", issue: "F0", wave: "none" }],
		},
	};
}

function writeScratchTree(dir, options) {
	for (const [rel, body] of Object.entries(emptyAllowlistBodies())) {
		const abs = path.join(dir, rel);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(`${abs}`, `${JSON.stringify(body, null, "\t")}\n`);
	}
	fs.writeFileSync(
		path.join(dir, "scripts/ch-nocheck-allowlist.txt"),
		"# empty on purpose\n",
	);
	if (options.allowlistOverlay) {
		const dest = path.join(dir, options.allowlistOverlay.dest);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(options.allowlistOverlay.src, dest);
	}
	fs.writeFileSync(
		path.join(dir, "scripts/ch-gates.mjs"),
		'const CONSOLE_SINK_PATHS = new Set(["packages/keep/src/ok.ts"]);\n',
	);
	fs.writeFileSync(
		path.join(dir, "scripts/migration-guide-check.mjs"),
		'const FIDELITY_EXPORTERS = ["packages/keep/FIDELITY.md"];\n',
	);
	fs.writeFileSync(
		path.join(dir, "scripts/api-docs-coverage.mjs"),
		'const NAMED_MODULES = ["singleFieldNativeLeftover"];\n',
	);
	const eslintSrc = options.eslintFixture
		? options.eslintFixture
		: path.join(FIXTURE_DIR, "marked-zero-glob.eslint.config.mjs");
	fs.copyFileSync(eslintSrc, path.join(dir, ESLINT_REL));
	const keepDir = path.join(dir, "packages/keep/src");
	fs.mkdirSync(keepDir, { recursive: true });
	fs.writeFileSync(path.join(keepDir, "ok.ts"), "export const ok = 1;\n");
	fs.writeFileSync(path.join(dir, "packages/keep/FIDELITY.md"), "# keep\n");
}

function withScratch(prefix, options, fn) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	try {
		writeScratchTree(dir, options);
		return fn(dir);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

export function runSelfTests(repoRoot = DEFAULT_REPO_ROOT) {
	assert(isPathShaped("packages/core/src/editor/events.ts"), "self-test: repo path");
	assert(
		isPathShaped("packages/extensions/ai/src/**/*.ts"),
		"self-test: repo glob",
	);
	assert(!isPathShaped("caretPositions.ts"), "self-test: basename is not a path");
	assert(!isPathShaped("generateId"), "self-test: export name is not a path");
	assert(!isPathShaped("@input/pen-ai"), "self-test: package name is not a path");
	assert(!isPathShaped("./autocomplete"), "self-test: export key is not a path");
	assert(
		!isPathShaped("./field-editor/clipboard"),
		"self-test: nested export key is not a path",
	);
	assert(
		!isPathShaped("src/extension.ts"),
		"self-test: unprefixed relative is not a repo path",
	);
	assert(
		isAmbiguousPath("src/extension.ts"),
		"self-test: unprefixed relative is ambiguous",
	);
	assert(
		!isAmbiguousPath("node:fs/promises"),
		"self-test: node: specifier is not an ambiguous path",
	);
	assert(
		!isAmbiguousPath("candidate for @input/pen-dom"),
		"self-test: prose with slashes is not an ambiguous path",
	);
	assert(
		isLintTargetGlob("**/*.test.ts"),
		"self-test: root lint glob is a target",
	);
	assert(
		!isLintTargetGlob("caretPositions.ts"),
		"self-test: basename is not a lint target",
	);
	const afterRegex = collectTopLevelPathStrings(
		'const IDENT_RE = /`foo{1,2}`/g;\nconst FIDELITY_EXPORTERS = ["packages/keep/FIDELITY.md"];\n',
		"tmp.mjs",
	);
	assert(
		afterRegex.some((claim) => claim.path === "packages/keep/FIDELITY.md"),
		`self-test: path array after a regex const must be collected, got ${JSON.stringify(afterRegex)}`,
	);

	const missingFixture = path.join(FIXTURE_DIR, "missing-path-allowlist.json");
	const unmarkedFixture = path.join(
		FIXTURE_DIR,
		"unmarked-zero-glob.eslint.config.mjs",
	);
	const staleFixture = path.join(
		FIXTURE_DIR,
		"stale-zero-marker.eslint.config.mjs",
	);
	const markedFixture = path.join(
		FIXTURE_DIR,
		"marked-zero-glob.eslint.config.mjs",
	);
	assert(fs.existsSync(missingFixture), "self-test: missing-path fixture");
	assert(fs.existsSync(unmarkedFixture), "self-test: unmarked-zero fixture");
	assert(fs.existsSync(staleFixture), "self-test: stale-zero fixture");
	assert(fs.existsSync(markedFixture), "self-test: marked-zero fixture");

	const seeded = withScratch(
		"pen-i15-seeded-",
		{
			allowlistOverlay: {
				src: missingFixture,
				dest: "scripts/no-new-slots-allowlist.json",
			},
			eslintFixture: unmarkedFixture,
		},
		(dir) => checkInstrumentPaths(dir),
	);
	assert(!seeded.ok, "self-test: seeded violations must fail");
	const seededReport = formatReport(seeded);
	const caughtMissing = seeded.findings.some(
		(finding) =>
			finding.status === "missing" &&
			finding.path === "packages/deleted-satellite/src/extension.ts",
	);
	const caughtEmpty = seeded.findings.some(
		(finding) =>
			finding.status === "empty-glob" &&
			finding.path === "packages/deleted-satellite/src/**/*.ts",
	);
	assert(
		caughtMissing,
		`self-test: nonexistent allowlist path must be detected, got ${seededReport}`,
	);
	assert(
		caughtEmpty,
		`self-test: unmarked zero-match glob must be detected, got ${seededReport}`,
	);
	assert(
		/population: \d+ path claims \(/.test(seededReport) &&
			!/size-limit/.test(seededReport),
		`self-test: population line must not carry a size-limit category, got ${seededReport}`,
	);
	assert(
		!seeded.findings.some(
			(finding) =>
				finding.path === "src/extension.ts" ||
				finding.path === "./field-editor/clipboard" ||
				finding.path === "caretPositions.ts",
		),
		`self-test: identifier-shaped and ambiguous entries must not fail, got ${seededReport}`,
	);
	assert(
		seeded.skipped.some((item) => item.value === "src/extension.ts"),
		`self-test: unprefixed file field must be listed as ambiguous, got ${JSON.stringify(seeded.skipped)}`,
	);

	const stale = withScratch(
		"pen-i15-stale-",
		{ eslintFixture: staleFixture },
		(dir) => checkInstrumentPaths(dir),
	);
	assert(!stale.ok, "self-test: stale zero-marker must fail");
	assert(
		stale.findings.some((finding) => finding.status === "stale-zero"),
		`self-test: stale zero-marker must be detected, got ${formatReport(stale)}`,
	);

	const marked = withScratch(
		"pen-i15-marked-",
		{ eslintFixture: markedFixture },
		(dir) => checkInstrumentPaths(dir),
	);
	assert(
		marked.ok,
		`self-test: marked ban-glob must pass, got ${formatReport(marked)}`,
	);

	const empty = withScratch(
		"pen-i15-empty-",
		{ eslintFixture: markedFixture },
		(dir) => {
			fs.writeFileSync(
				path.join(dir, ESLINT_REL),
				"export default [];\n",
			);
			fs.writeFileSync(path.join(dir, "scripts/ch-gates.mjs"), "\n");
			fs.writeFileSync(
				path.join(dir, "scripts/migration-guide-check.mjs"),
				"\n",
			);
			return checkInstrumentPaths(dir);
		},
	);
	assert(!empty.ok, "self-test: empty instrument set must fail closed");
	assert(
		empty.findings.some((finding) => finding.message === CANNOT_CHECK_EMPTY),
		`self-test: empty population, got ${formatReport(empty)}`,
	);

	return {
		seeded: seededReport,
		stale: formatReport(stale),
		marked: formatReport(marked),
	};
}

function main() {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.selfTest) {
		const reports = runSelfTests(parsed.repoRoot);
		console.log("I15 instrument-paths self-test ok");
		console.log(
			"  red-proof: nonexistent allowlist path and unmarked zero-match glob fail closed",
		);
		console.log(
			"  red-proof: stale // I15-zero: marker and empty instrument set fail closed",
		);
		console.log(reports.seeded);
		return;
	}

	const run = checkInstrumentPaths(parsed.repoRoot);
	console.log(formatReport(run));
	if (!run.ok) {
		process.exitCode = 1;
	}
}

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
