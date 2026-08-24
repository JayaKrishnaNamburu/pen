#!/usr/bin/env node
/**
 * Wave 6 GATE 6.6 residue inventory (spec-v3/waves/wave-6-surface-release.md).
 *
 * GATE 6.6 greps every old satellite specifier under packages/ + playground/.
 * `scripts/migrate-imports-v3.mjs` rewrites specifier positions only, so a
 * correct --write still leaves vite alias keys, test titles, docs prose,
 * tsconfig path keys, and unpredicted string literals. This script subtracts
 * the rewriteable hits from the gate population and classifies the rest.
 *
 * A red GATE 6.6 after a correct codemod run is this worklist, not a
 * tool failure. A total that does not reconcile against the census is
 * the defect.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	CENSUS_LINE_RE,
	MANIFEST_REWRITE,
	SOURCE_REWRITE,
	censusRoots,
	countCensusLineHits,
	rewriteFileText,
	shouldRewriteFile,
} from "./migrate-imports-v3.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_ROOT = path.join(
	SCRIPT_DIR,
	"__fixtures__",
	"wave6-manual-work-inventory",
);

export const USAGE =
	"Usage: node scripts/wave6-manual-work-inventory.mjs [--self-test] [--repo-root <dir>] [dir...]";

export const RESIDUE_CLASSES = [
	"vite-alias-key",
	"test-title",
	"docs-prose",
	"tsconfig-path",
	"unclassified",
];

export const EMPTY_SCAN = "cannot inventory: scan roots matched 0 files";
export const EMPTY_ROOT = "cannot inventory: a named scan root matched 0 files";
export const ROOT_MISSING = "cannot inventory: scan root is absent";
export const FIXTURE_ABSENT = "cannot inventory: fixture suite is absent";
export const RECONCILE_FAIL = "cannot inventory: bucket totals do not reconcile";
export const CENSUS_DRIFT = "cannot inventory: file walk drifted from censusRoots";
export const UNKNOWN_FLAG = "unknown flag";

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

const CENSUS_EXTENSIONS = new Set([".ts", ".tsx", ".vue", ".mjs"]);
const TSCONFIG_NAME_RE = /^tsconfig.*\.json$/;
const VITE_CONFIG_RE = /^vite\.config\.[cm]?[jt]sx?$/;
const TEST_TITLE_RE =
	/\b(?:describe|it|test|suite)(?:\.\w+)*\s*\(\s*(['"`])/;
const ALIAS_KEY_RE = /^\s*['"]@input\/pen-[^'"]+['"]\s*:/;
const PATHS_KEY_RE = /^\s*['"]@input\/pen-[^'"]+['"]\s*:\s*\[/;
const CODE_TAG_RE = /<\/?code\b/i;

const MANIFEST_DEP_FIELDS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];

const SPECIFIER_NAMES = Object.keys(SOURCE_REWRITE).sort(
	(left, right) => right.length - left.length,
);

const SPECIFIER_CAPTURE_RE =
	/@input\/pen-(?:ai-suggestions|ai-autocomplete|ai-skills|ai-tools|delta-stream|import-[A-Za-z0-9-]+|export-[A-Za-z0-9-]+)/g;

export function parseArgs(argv, repoRoot = DEFAULT_REPO_ROOT) {
	let selfTest = false;
	let root = repoRoot;
	const paths = [];
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
		if (arg === "--help") {
			return { help: true, selfTest, repoRoot: root, paths };
		}
		if (arg.startsWith("--")) {
			throw new Error(`${UNKNOWN_FLAG}: ${arg}`);
		}
		paths.push(arg);
	}
	return { help: false, selfTest, repoRoot: root, paths };
}

export function toPosix(relPath) {
	return relPath.split(path.sep).join(path.posix.sep);
}

export function specifiersOnLine(line) {
	const found = [];
	for (const name of SPECIFIER_NAMES) {
		if (line.includes(name)) {
			found.push(name);
		}
	}
	SPECIFIER_CAPTURE_RE.lastIndex = 0;
	let match = SPECIFIER_CAPTURE_RE.exec(line);
	while (match) {
		if (!found.includes(match[0])) {
			found.push(match[0]);
		}
		match = SPECIFIER_CAPTURE_RE.exec(line);
	}
	return found;
}

export function findMatchingLines(text) {
	const lines = text.split(/\r?\n/);
	const hits = [];
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (CENSUS_LINE_RE.test(line)) {
			hits.push({
				line: index + 1,
				text: line,
				specifiers: specifiersOnLine(line),
			});
		}
	}
	return hits;
}

export function isAliasKeyLine(line) {
	return ALIAS_KEY_RE.test(line);
}

export function isPathsKeyLine(line) {
	return PATHS_KEY_RE.test(line);
}

export function isTestTitleLine(line) {
	return TEST_TITLE_RE.test(line) && CENSUS_LINE_RE.test(line);
}

export function isDocsProseLine(relPath, line) {
	const posix = toPosix(relPath);
	if (!posix.startsWith("packages/docs/")) {
		return false;
	}
	return CODE_TAG_RE.test(line);
}

export function classifyResidue(relPath, lineText) {
	const base = path.basename(relPath);
	if (TSCONFIG_NAME_RE.test(base) && isPathsKeyLine(lineText)) {
		return "tsconfig-path";
	}
	if (VITE_CONFIG_RE.test(base) && isAliasKeyLine(lineText)) {
		return "vite-alias-key";
	}
	if (isTestTitleLine(lineText)) {
		return "test-title";
	}
	if (isDocsProseLine(relPath, lineText)) {
		return "docs-prose";
	}
	return "unclassified";
}

export function noteForHit(hit) {
	switch (hit.class) {
		case "vite-alias-key":
			return "Delete or repoint this alias key; the satellite no longer exists after the merge.";
		case "test-title":
			return "Rename the suite title to the merged subpath; the file moves with the merge.";
		case "docs-prose":
			return "Re-point this user-facing mention to the merged package or subpath.";
		case "tsconfig-path":
			return "Repoint or delete this paths mapping; --write leaves tsconfig keys alone.";
		case "unclassified":
			return noteUnclassified(hit);
		default: {
			const exhaustive = hit.class;
			throw new Error(`unknown residue class: ${exhaustive}`);
		}
	}
}

function noteUnclassified(hit) {
	const base = path.basename(hit.file);
	if (base === "package.json") {
		if (/^\s*"name"\s*:/.test(hit.text)) {
			return "Satellite package.json name — the directory is deleted by the merge.";
		}
		return "Manifest string the codemod does not rewrite (not a dependency key).";
	}
	if (base === "tsup.config.ts") {
		return "tsup external/noExternal string — rename to the merged package by hand.";
	}
	if (/owner:\s*['"]@input\/pen-/.test(hit.text)) {
		return "Data field naming a retired package (not an import) — update by hand.";
	}
	const trimmed = hit.text.trim();
	if (
		trimmed.startsWith("*") ||
		trimmed.startsWith("/*") ||
		trimmed.startsWith("//")
	) {
		return "Comment or JSDoc mention — update the prose; not a specifier position.";
	}
	if (hit.blockedReason) {
		return `Codemod fails closed on this file (${hit.blockedReason}); inspect by hand.`;
	}
	return "Unpredicted leftover — inspect and update by hand; do not widen the codemod to string literals.";
}

function parseManifest(text) {
	try {
		const parsed = JSON.parse(text);
		if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function isRewriteableManifestLine(line, manifest) {
	if (manifest == null) {
		return false;
	}
	const keyMatch = line.match(/^\s*"(@input\/pen-[^"]+)"\s*:/);
	if (!keyMatch) {
		return false;
	}
	const key = keyMatch[1];
	if (!Object.hasOwn(MANIFEST_REWRITE, key)) {
		return false;
	}
	for (const field of MANIFEST_DEP_FIELDS) {
		const value = manifest[field];
		if (
			value != null &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			Object.hasOwn(value, key)
		) {
			return true;
		}
	}
	const meta = manifest.peerDependenciesMeta;
	if (
		meta != null &&
		typeof meta === "object" &&
		!Array.isArray(meta) &&
		Object.hasOwn(meta, key)
	) {
		return true;
	}
	return false;
}

// collectFiles is not exported from the codemod. This walk mirrors its
// census options (extensions + package.json + tsconfig*.json, same
// ignore dirs). Drift is a hard fail: gateMatches must equal censusRoots.
function collectCensusFiles(root) {
	const found = [];

	function walk(dir) {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch (error) {
			if (error && error.code === "ENOENT") {
				return;
			}
			throw error;
		}
		for (const entry of entries) {
			const entryPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORE_DIR_NAMES.has(entry.name)) {
					walk(entryPath);
				}
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			if (entry.name === "package.json") {
				found.push(entryPath);
				continue;
			}
			if (TSCONFIG_NAME_RE.test(entry.name)) {
				found.push(entryPath);
				continue;
			}
			if (!CENSUS_EXTENSIONS.has(path.extname(entry.name))) {
				continue;
			}
			found.push(entryPath);
		}
	}

	walk(root);
	found.sort((left, right) => left.localeCompare(right));
	return found;
}

export function partitionFile(filePath, text) {
	const hits = findMatchingLines(text);
	if (hits.length !== countCensusLineHits(text)) {
		throw new Error(
			`${CENSUS_DRIFT}: line finder disagreed with countCensusLineHits in ${filePath}`,
		);
	}
	if (hits.length === 0) {
		return { rewriteable: [], residue: [], blockedReason: null };
	}

	const kind = shouldRewriteFile(filePath);
	const rewritten = rewriteFileText(filePath, text);
	const blockedReason = rewritten.ok ? null : (rewritten.reason ?? "rewrite failed");

	if (kind === "manifest") {
		const manifest = parseManifest(text);
		const rewriteable = [];
		const residue = [];
		for (const hit of hits) {
			if (isRewriteableManifestLine(hit.text, manifest)) {
				rewriteable.push(hit);
			} else {
				residue.push(hit);
			}
		}
		return { rewriteable, residue, blockedReason };
	}

	if (kind === "source" && rewritten.ok) {
		const nextLines = rewritten.text.split(/\r?\n/);
		if (nextLines.length === text.split(/\r?\n/).length) {
			const rewriteable = [];
			const residue = [];
			for (const hit of hits) {
				const next = nextLines[hit.line - 1] ?? "";
				if (CENSUS_LINE_RE.test(next)) {
					residue.push(hit);
				} else {
					rewriteable.push(hit);
				}
			}
			return { rewriteable, residue, blockedReason: null };
		}
	}

	return { rewriteable: [], residue: hits, blockedReason };
}

export function emptyBuckets() {
	return {
		rewriteable: 0,
		"vite-alias-key": 0,
		"test-title": 0,
		"docs-prose": 0,
		"tsconfig-path": 0,
		unclassified: 0,
	};
}

export function inventoryRoots(roots, repoRoot) {
	const missing = [];
	const perRoot = [];
	const files = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) {
			missing.push(root);
			continue;
		}
		const collected = collectCensusFiles(root);
		perRoot.push({
			root,
			rel: toPosix(path.relative(repoRoot, root) || path.basename(root)),
			files: collected.length,
		});
		files.push(...collected);
	}

	if (missing.length > 0) {
		return {
			ok: false,
			reason: `${ROOT_MISSING}: ${missing[0]}`,
			population: 0,
			perRoot,
			gateMatches: 0,
			censusMatches: 0,
			buckets: emptyBuckets(),
			residue: [],
			blocked: [],
			hitFiles: 0,
			packageJson: 0,
		};
	}

	if (files.length === 0) {
		return {
			ok: false,
			reason: EMPTY_SCAN,
			population: 0,
			perRoot,
			gateMatches: 0,
			censusMatches: 0,
			buckets: emptyBuckets(),
			residue: [],
			blocked: [],
			hitFiles: 0,
			packageJson: 0,
		};
	}

	const emptyNamed = perRoot.filter((entry) => entry.files === 0);
	if (emptyNamed.length > 0) {
		return {
			ok: false,
			reason: `${EMPTY_ROOT}: ${emptyNamed.map((entry) => entry.rel).join(", ")} (population ${files.length} across the other roots)`,
			population: files.length,
			perRoot,
			gateMatches: 0,
			censusMatches: 0,
			buckets: emptyBuckets(),
			residue: [],
			blocked: [],
			hitFiles: 0,
			packageJson: 0,
		};
	}

	const census = censusRoots(roots);
	const buckets = emptyBuckets();
	const residue = [];
	const blocked = [];
	let gateMatches = 0;
	let hitFiles = 0;
	let packageJson = 0;

	for (const filePath of files) {
		const text = fs.readFileSync(filePath, "utf8");
		const partitioned = partitionFile(filePath, text);
		const fileHits = partitioned.rewriteable.length + partitioned.residue.length;
		if (fileHits === 0) {
			continue;
		}
		gateMatches += fileHits;
		hitFiles += 1;
		if (path.basename(filePath) === "package.json") {
			packageJson += 1;
		}
		buckets.rewriteable += partitioned.rewriteable.length;
		const rel = toPosix(path.relative(repoRoot, filePath));
		if (partitioned.blockedReason) {
			blocked.push({ file: rel, reason: partitioned.blockedReason });
		}
		for (const hit of partitioned.residue) {
			const classified = {
				file: rel,
				line: hit.line,
				text: hit.text,
				specifiers: hit.specifiers,
				class: classifyResidue(rel, hit.text),
				blockedReason: partitioned.blockedReason,
			};
			classified.note = noteForHit(classified);
			residue.push(classified);
			buckets[classified.class] += 1;
		}
	}

	residue.sort((left, right) => {
		const byClass =
			RESIDUE_CLASSES.indexOf(left.class) - RESIDUE_CLASSES.indexOf(right.class);
		if (byClass !== 0) {
			return byClass;
		}
		const byFile = left.file.localeCompare(right.file);
		if (byFile !== 0) {
			return byFile;
		}
		return left.line - right.line;
	});

	const residueTotal = RESIDUE_CLASSES.reduce(
		(sum, key) => sum + buckets[key],
		0,
	);
	const bucketSum = buckets.rewriteable + residueTotal;
	const censusMatches = census.ok ? census.matches : 0;
	const censusOk = census.ok && censusMatches === gateMatches;
	const reconcileOk = bucketSum === gateMatches && censusOk;

	let reason = null;
	if (!census.ok) {
		reason = census.reason;
	} else if (!censusOk) {
		reason = `${CENSUS_DRIFT}: walk ${gateMatches} vs censusRoots ${censusMatches}`;
	} else if (bucketSum !== gateMatches) {
		reason = `${RECONCILE_FAIL}: ${buckets.rewriteable} rewriteable + ${residueTotal} residue = ${bucketSum}, GATE 6.6 = ${gateMatches}`;
	}

	return {
		ok: reconcileOk,
		reason,
		population: files.length,
		perRoot,
		gateMatches,
		censusMatches,
		censusPopulation: census.population,
		buckets,
		residueTotal,
		bucketSum,
		residue,
		blocked,
		hitFiles,
		packageJson,
	};
}

export function defaultScanRoots(repoRoot) {
	return [
		path.join(repoRoot, "packages"),
		path.join(repoRoot, "playground"),
	];
}

export function renderReport(result) {
	const lines = [];
	lines.push("Wave 6 GATE 6.6 manual-work inventory");
	lines.push("");
	const rootBits = result.perRoot
		.map((entry) => `${entry.rel} ${entry.files}`)
		.join(", ");
	lines.push(
		`population: scanned ${result.population} files (${rootBits})`,
	);
	if (result.censusPopulation) {
		lines.push(`census:     ${result.censusPopulation}`);
	}
	lines.push(
		`GATE 6.6:   ${result.gateMatches} matches across ${result.hitFiles} files (${result.packageJson} package.json)`,
	);
	lines.push("");
	lines.push("Reconciliation");
	lines.push(
		`  rewriteable        ${String(result.buckets.rewriteable).padStart(5)}   (codemod --write clears these)`,
	);
	for (const key of RESIDUE_CLASSES) {
		lines.push(
			`  ${key.padEnd(18)} ${String(result.buckets[key]).padStart(5)}`,
		);
	}
	lines.push(`  ${"".padEnd(18)} -----`);
	lines.push(
		`  sum                ${String(result.bucketSum).padStart(5)}`,
	);
	lines.push(
		`  GATE 6.6           ${String(result.gateMatches).padStart(5)}`,
	);
	const arithmetic = `${result.buckets.rewriteable} + ${result.residueTotal} = ${result.bucketSum}`;
	if (result.ok) {
		lines.push(`  OK  ${arithmetic}`);
	} else {
		lines.push(`  FAIL  ${arithmetic} vs GATE 6.6 ${result.gateMatches}`);
		if (result.reason) {
			lines.push(`  ${result.reason}`);
		}
	}

	if (result.blocked.length > 0) {
		lines.push("");
		lines.push(
			`Rewrite blocked on ${result.blocked.length} file(s) (codemod fails closed; dependency keys still count as rewriteable):`,
		);
		for (const entry of result.blocked) {
			lines.push(`  ${entry.file}  ${entry.reason}`);
		}
	}

	for (const key of RESIDUE_CLASSES) {
		const rows = result.residue.filter((hit) => hit.class === key);
		lines.push("");
		lines.push(`## ${key} (${rows.length})`);
		if (rows.length === 0) {
			lines.push(
				"(none on this scan; classifier positive control is the fixture suite)",
			);
			continue;
		}
		for (const hit of rows) {
			const specifier =
				hit.specifiers.length > 0 ? hit.specifiers.join(", ") : "(unparsed)";
			lines.push(
				`${hit.file}:${hit.line}  ${specifier}  ${hit.class}  ${hit.note}`,
			);
		}
	}

	return lines.join("\n");
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runClassifierSelfTests() {
	assert(
		classifyResidue("playground/vite.config.ts", '\t"@input/pen-ai-skills": fileURLToPath(') ===
			"vite-alias-key",
		"self-test: vite alias key",
	);
	assert(
		classifyResidue(
			"packages/extensions/export-html/src/__tests__/exportHtml.test.ts",
			'describe("@input/pen-export-html", () => {',
		) === "test-title",
		"self-test: test title",
	);
	assert(
		classifyResidue(
			"packages/docs/src/pages/Security.tsx",
			"\t\t\t\tin <code>@input/pen-import-html</code>): paste{\" \"}",
		) === "docs-prose",
		"self-test: docs prose",
	);
	assert(
		classifyResidue(
			"playground/tsconfig.json",
			'\t\t"@input/pen-ai-suggestions": ["../packages/extensions/ai-suggestions/src/index.ts"],',
		) === "tsconfig-path",
		"self-test: tsconfig path",
	);
	assert(
		classifyResidue(
			"packages/docs/scripts/check-doc2-pages.mjs",
			'\t\towner: "@input/pen-import-html",',
		) === "unclassified",
		"self-test: docs data string is unclassified",
	);
	assert(
		classifyResidue(
			"packages/extensions/export-html/package.json",
			'\t"name": "@input/pen-export-html",',
		) === "unclassified",
		"self-test: manifest name is unclassified",
	);
	assert(
		isRewriteableManifestLine('\t\t"@input/pen-ai-tools": "workspace:*"', {
			dependencies: { "@input/pen-ai-tools": "workspace:*" },
		}) === true,
		"self-test: manifest dep key is rewriteable",
	);
	assert(
		isRewriteableManifestLine('\t"name": "@input/pen-export-html",', {
			name: "@input/pen-export-html",
			dependencies: { "@input/pen-ai-tools": "workspace:*" },
		}) === false,
		"self-test: manifest name is not rewriteable",
	);

	const mixed = partitionFile(
		"mixed.ts",
		'import { htmlOut } from "@input/pen-export-html"; describe("@input/pen-export-html", () => {});\n',
	);
	assert(
		mixed.rewriteable.length === 0 && mixed.residue.length === 1,
		"self-test: a line the rewrite does not clear stays residue",
	);
	assert(
		classifyResidue("packages/demo/src/mixed.ts", mixed.residue[0].text) ===
			"test-title",
		"self-test: mixed leftover line is a test title",
	);

	const importOnly = partitionFile(
		"rewrite.ts",
		'import { htmlOut } from "@input/pen-export-html";\n',
	);
	assert(
		importOnly.rewriteable.length === 1 && importOnly.residue.length === 0,
		"self-test: a cleared specifier line is rewriteable, not residue",
	);
}

export function runFixtureSuite(fixtureRoot = FIXTURE_ROOT) {
	const tree = path.join(fixtureRoot, "tree");
	const expectedPath = path.join(fixtureRoot, "expected.json");
	if (!fs.existsSync(tree) || !fs.existsSync(expectedPath)) {
		return { ok: false, reason: FIXTURE_ABSENT };
	}
	const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
	const roots = [path.join(tree, "packages"), path.join(tree, "playground")];
	const result = inventoryRoots(roots, tree);
	if (!result.ok) {
		return { ok: false, reason: result.reason, result, expected };
	}
	const checks = [
		["gateMatches", result.gateMatches, expected.gateMatches],
		["rewriteable", result.buckets.rewriteable, expected.rewriteable],
		["vite-alias-key", result.buckets["vite-alias-key"], expected["vite-alias-key"]],
		["test-title", result.buckets["test-title"], expected["test-title"]],
		["docs-prose", result.buckets["docs-prose"], expected["docs-prose"]],
		["tsconfig-path", result.buckets["tsconfig-path"], expected["tsconfig-path"]],
		["unclassified", result.buckets.unclassified, expected.unclassified],
		["scannedFiles", result.population, expected.scannedFiles],
	];
	for (const [name, actual, want] of checks) {
		if (actual !== want) {
			return {
				ok: false,
				reason: `fixture ${name}: got ${actual}, expected ${want}`,
				result,
				expected,
			};
		}
	}
	for (const key of RESIDUE_CLASSES) {
		if (result.buckets[key] === 0) {
			return {
				ok: false,
				reason: `fixture class ${key} has 0 hits (positive control missing)`,
				result,
				expected,
			};
		}
	}
	if (result.buckets.rewriteable === 0) {
		return {
			ok: false,
			reason: "fixture rewriteable has 0 hits (subtraction positive control missing)",
			result,
			expected,
		};
	}
	return { ok: true, reason: null, result, expected };
}

export function runSelfTests(fixtureRoot = FIXTURE_ROOT) {
	runClassifierSelfTests();
	const suite = runFixtureSuite(fixtureRoot);
	assert(suite.ok, `self-test: fixture suite failed: ${suite.reason}`);
	return suite;
}

function resolveTargets(repoRoot, paths) {
	return paths.map((entry) =>
		path.isAbsolute(entry) ? entry : path.resolve(repoRoot, entry),
	);
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		console.error(USAGE);
		process.exitCode = 1;
		return;
	}

	if (args.help) {
		console.log(USAGE);
		return;
	}

	try {
		runSelfTests();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
		return;
	}
	console.log(
		"wave6-manual-work-inventory self-test ok (every residue class has a fixture hit; rewriteable subtraction has a positive control)",
	);

	if (args.selfTest) {
		return;
	}

	const roots =
		args.paths.length > 0
			? resolveTargets(args.repoRoot, args.paths)
			: defaultScanRoots(args.repoRoot);
	const result = inventoryRoots(roots, args.repoRoot);
	console.log(renderReport(result));
	if (!result.ok) {
		console.error(result.reason);
		process.exitCode = 1;
	}
}

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
	main();
}
