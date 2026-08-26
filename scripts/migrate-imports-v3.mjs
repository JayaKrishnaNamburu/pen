#!/usr/bin/env node
/**
 * SF5 import migration (spec/rules/api.md, wave-6 Step 6.3).
 *
 * Rewrites retired Wave 6 specifiers to the merged `@input/pen-ai` and
 * `@input/pen-interop` subpaths. Source rewrite is specifier-position
 * only — ordinary strings stay put (the red-proof). Manifest rewrite
 * is a de-duplicating merge onto the package name, not the subpath.
 *
 * `--check` is a GATE 6.6 census (read-only). `--write` applies the
 * rewrite to explicit target paths. Default / `--self-test` runs the
 * fixture suite. Do not `--write` packages/ or playground/ until the
 * merge targets exist.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_ROOT = path.join(
	SCRIPT_DIR,
	"__fixtures__",
	"migrate-imports-v3",
);

export const SOURCE_REWRITE = {
	"@input/pen-ai-suggestions": "@input/pen-ai/suggestions",
	"@input/pen-ai-autocomplete": "@input/pen-ai/autocomplete",
	"@input/pen-ai-skills": "@input/pen-ai/skills",
	"@input/pen-ai-tools": "@input/pen-ai/tools",
	"@input/pen-delta-stream": "@input/pen-ai/stream",
	"@input/pen-import-html": "@input/pen-interop/html",
	"@input/pen-export-html": "@input/pen-interop/html",
	"@input/pen-import-json": "@input/pen-interop/json",
	"@input/pen-export-json": "@input/pen-interop/json",
	"@input/pen-import-markdown": "@input/pen-interop/markdown",
	"@input/pen-export-markdown": "@input/pen-interop/markdown",
	"@input/pen-export-xml": "@input/pen-interop/xml",
};

export const MANIFEST_REWRITE = {
	"@input/pen-ai-suggestions": "@input/pen-ai",
	"@input/pen-ai-autocomplete": "@input/pen-ai",
	"@input/pen-ai-skills": "@input/pen-ai",
	"@input/pen-ai-tools": "@input/pen-ai",
	"@input/pen-delta-stream": "@input/pen-ai",
	"@input/pen-import-html": "@input/pen-interop",
	"@input/pen-export-html": "@input/pen-interop",
	"@input/pen-import-json": "@input/pen-interop",
	"@input/pen-export-json": "@input/pen-interop",
	"@input/pen-import-markdown": "@input/pen-interop",
	"@input/pen-export-markdown": "@input/pen-interop",
	"@input/pen-export-xml": "@input/pen-interop",
};

const OLD_SOURCE_NAMES = Object.keys(SOURCE_REWRITE);

export const CENSUS_LINE_RE =
	/@input\/pen-(?:ai-suggestions|ai-autocomplete|ai-skills|ai-tools|delta-stream)|@input\/pen-(?:import|export)-/;

const SPECIFIER_RE =
	/((?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+))(['"])(@input\/pen-[^'"]+)\2/g;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".vue", ".mjs"]);
// Census must equal GATE 6.6's glob set, or the tool and the gate report two
// populations. The census is wider than the write set: tsconfig path mappings
// are real module resolution the gate must see, but they are not specifier
// positions, so --write leaves them to the merge PR.
const CENSUS_EXTENSIONS = new Set([".ts", ".tsx", ".vue", ".mjs"]);
const TSCONFIG_RE = /^tsconfig.*\.json$/;

const DEP_FIELDS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

export const UNKNOWN_FLAG = "unknown flag";
export const CHECK_WRITE_MUTEX =
	"cannot run: --check and --write are mutually exclusive";
export const WRITE_WITHOUT_TARGET = "cannot write: no target path given";
export const WRITE_PATH_MISSING = "cannot write: path does not exist";
export const CHECK_ROOT_MISSING = "cannot check: scan root is absent";
export const CHECK_EMPTY_SCAN = "cannot check: scan roots matched 0 files";
export const FIXTURE_SUITE_ABSENT = "cannot check: fixture suite is absent";
export const FIXTURE_SUITE_EMPTY_PASSING =
	"cannot check: fixture suite has 0 passing fixtures";
export const FIXTURE_SUITE_EMPTY_FAILING =
	"cannot check: fixture suite has 0 failing fixtures";
export const FIXTURE_MISSING_AFTER =
	"cannot check: passing fixture has no after tree";
export const FIXTURE_MISSING_REASON =
	"cannot check: failing fixture has no expected-reason.txt";
export const DEEP_IMPORT = "deep import";
export const VERSION_RANGE_CONFLICT = "version-range conflict";
export const INVALID_PACKAGE_JSON =
	"cannot rewrite: package.json is not valid JSON";
export const FIXTURE_MISMATCH =
	"rewritten output does not match expected after";
export const FIXTURE_EXPECTED_FAILURE = "expected failure, got success";

export const USAGE =
	"Usage: node scripts/migrate-imports-v3.mjs [--self-test] [--check [dir...]] [--write <dir...>] [--repo-root <dir>]";

export function parseArgs(argv, repoRoot = DEFAULT_REPO_ROOT) {
	let check = false;
	let write = false;
	let selfTest = false;
	let root = repoRoot;
	const paths = [];
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--check") {
			check = true;
			continue;
		}
		if (arg === "--write") {
			write = true;
			continue;
		}
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
			throw new Error(`${UNKNOWN_FLAG}: ${arg}`);
		}
		paths.push(arg);
	}
	if (check && write) {
		throw new Error(CHECK_WRITE_MUTEX);
	}
	if (!check && !write && !selfTest) {
		selfTest = true;
	}
	if (write && paths.length === 0) {
		throw new Error(WRITE_WITHOUT_TARGET);
	}
	return { check, write, selfTest, repoRoot: root, paths };
}

export function classifySourceSpecifier(specifier) {
	if (Object.hasOwn(SOURCE_REWRITE, specifier)) {
		return { kind: "rewrite", next: SOURCE_REWRITE[specifier] };
	}
	for (const oldName of OLD_SOURCE_NAMES) {
		if (specifier.startsWith(`${oldName}/`)) {
			return { kind: "deep", specifier };
		}
	}
	return { kind: "keep" };
}

export function formatDeepImport(specifier, filePath) {
	const where = filePath ? `${filePath} ` : "";
	return `${DEEP_IMPORT}: ${where}${specifier} is not a bare specifier`;
}

export function formatVersionConflict(target, left, right, filePath) {
	const where = filePath ? `${filePath} ` : "";
	return `${VERSION_RANGE_CONFLICT}: ${where}${target} has ${left} and ${right}`;
}

export function formatFixtureMismatch(id, relPath) {
	return `fixture ${id}: ${FIXTURE_MISMATCH} (${relPath})`;
}

export function rewriteSourceText(text, filePath) {
	SPECIFIER_RE.lastIndex = 0;
	let deepReason = null;
	const next = text.replace(
		SPECIFIER_RE,
		(full, prefix, quote, specifier) => {
			const classified = classifySourceSpecifier(specifier);
			if (classified.kind === "deep") {
				deepReason = formatDeepImport(specifier, filePath);
				return full;
			}
			if (classified.kind === "rewrite") {
				return `${prefix}${quote}${classified.next}${quote}`;
			}
			return full;
		},
	);
	if (deepReason) {
		return { ok: false, reason: deepReason };
	}
	return { ok: true, text: next, changed: next !== text };
}

export function rewriteDepField(field, filePath) {
	const out = {};
	let changed = false;
	for (const [name, version] of Object.entries(field)) {
		const target = MANIFEST_REWRITE[name];
		if (target == null) {
			out[name] = version;
			continue;
		}
		changed = true;
		if (Object.hasOwn(out, target)) {
			if (out[target] !== version) {
				return {
					ok: false,
					reason: formatVersionConflict(
						target,
						out[target],
						version,
						filePath,
					),
				};
			}
			continue;
		}
		out[target] = version;
	}
	return { ok: true, field: out, changed };
}

export function rewriteMetaField(field) {
	const out = {};
	let changed = false;
	for (const [name, meta] of Object.entries(field)) {
		const target = MANIFEST_REWRITE[name] ?? name;
		if (target !== name) {
			changed = true;
		}
		if (Object.hasOwn(out, target) && target !== name) {
			continue;
		}
		out[target] = meta;
	}
	return { ok: true, field: out, changed };
}

export function rewriteManifest(manifest, filePath) {
	const next = { ...manifest };
	let changed = false;
	for (const field of DEP_FIELDS) {
		const value = next[field];
		if (
			value == null ||
			typeof value !== "object" ||
			Array.isArray(value)
		) {
			continue;
		}
		const rewritten = rewriteDepField(value, filePath);
		if (!rewritten.ok) {
			return rewritten;
		}
		if (rewritten.changed) {
			changed = true;
			next[field] = rewritten.field;
		}
	}
	const meta = next.peerDependenciesMeta;
	if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
		const rewritten = rewriteMetaField(meta);
		if (rewritten.changed) {
			changed = true;
			next.peerDependenciesMeta = rewritten.field;
		}
	}
	return { ok: true, manifest: next, changed };
}

export function detectIndent(text) {
	if (/\n\t"/.test(text)) {
		return "\t";
	}
	const match = text.match(/\n( +)"/);
	if (match) {
		return match[1];
	}
	return "  ";
}

export function rewriteManifestText(text, filePath) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, reason: INVALID_PACKAGE_JSON };
	}
	if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ok: false, reason: INVALID_PACKAGE_JSON };
	}
	const rewritten = rewriteManifest(parsed, filePath);
	if (!rewritten.ok) {
		return rewritten;
	}
	if (!rewritten.changed) {
		return { ok: true, text, changed: false };
	}
	const indent = detectIndent(text);
	const serialized = `${JSON.stringify(rewritten.manifest, null, indent)}\n`;
	return { ok: true, text: serialized, changed: true };
}

export function shouldRewriteFile(filePath) {
	const base = path.basename(filePath);
	if (base === "package.json") {
		return "manifest";
	}
	if (SOURCE_EXTENSIONS.has(path.extname(filePath))) {
		return "source";
	}
	return null;
}

export function rewriteFileText(filePath, text) {
	const kind = shouldRewriteFile(filePath);
	if (kind === "manifest") {
		return rewriteManifestText(text, filePath);
	}
	if (kind === "source") {
		return rewriteSourceText(text, filePath);
	}
	return { ok: true, text, changed: false };
}

function collectFiles(root, options) {
	const allow = options?.extensions ?? null;
	const includePackageJson = options?.includePackageJson !== false;
	const includeTsconfig = options?.includeTsconfig === true;
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
				if (includePackageJson) {
					found.push(entryPath);
				}
				continue;
			}
			if (TSCONFIG_RE.test(entry.name)) {
				if (includeTsconfig) {
					found.push(entryPath);
				}
				continue;
			}
			if (allow && !allow.has(path.extname(entry.name))) {
				continue;
			}
			found.push(entryPath);
		}
	}

	walk(root);
	found.sort((left, right) => left.localeCompare(right));
	return found;
}

export function rewriteTree(root) {
	const stat = fs.statSync(root);
	const files = stat.isFile()
		? [root]
		: collectFiles(root, {
				extensions: SOURCE_EXTENSIONS,
				includePackageJson: true,
			});
	const written = [];
	const reasons = [];
	for (const filePath of files) {
		const text = fs.readFileSync(filePath, "utf8");
		const result = rewriteFileText(filePath, text);
		if (!result.ok) {
			reasons.push(result.reason);
			continue;
		}
		if (result.changed) {
			fs.writeFileSync(filePath, result.text);
			written.push(filePath);
		}
	}
	if (reasons.length > 0) {
		return { ok: false, reasons, written };
	}
	return { ok: true, reasons: [], written };
}

export function countCensusLineHits(text) {
	let hits = 0;
	for (const line of text.split(/\r?\n/)) {
		if (CENSUS_LINE_RE.test(line)) {
			hits += 1;
		}
	}
	return hits;
}

export function formatPopulation(result) {
	return `population: ${result.matches} matches across ${result.files} distinct files, of which ${result.packageJson} are package.json`;
}

export function censusRoots(roots) {
	const missing = [];
	const files = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) {
			missing.push(root);
			continue;
		}
		files.push(
			...collectFiles(root, {
				extensions: CENSUS_EXTENSIONS,
				includePackageJson: true,
				includeTsconfig: true,
			}),
		);
	}
	if (missing.length > 0) {
		const rel = missing[0];
		return {
			ok: false,
			reason: `${CHECK_ROOT_MISSING}: ${rel}`,
			population: formatPopulation({
				matches: 0,
				files: 0,
				packageJson: 0,
			}),
			matches: 0,
			files: 0,
			packageJson: 0,
		};
	}
	if (files.length === 0) {
		return {
			ok: false,
			reason: CHECK_EMPTY_SCAN,
			population: formatPopulation({
				matches: 0,
				files: 0,
				packageJson: 0,
			}),
			matches: 0,
			files: 0,
			packageJson: 0,
		};
	}

	let matches = 0;
	let hitFiles = 0;
	let packageJson = 0;
	for (const filePath of files) {
		const text = fs.readFileSync(filePath, "utf8");
		const hits = countCensusLineHits(text);
		if (hits === 0) {
			continue;
		}
		matches += hits;
		hitFiles += 1;
		if (path.basename(filePath) === "package.json") {
			packageJson += 1;
		}
	}

	return {
		ok: true,
		reason: null,
		population: formatPopulation({
			matches,
			files: hitFiles,
			packageJson,
		}),
		matches,
		files: hitFiles,
		packageJson,
	};
}

function listFixtureDirs(fixtureRoot) {
	if (!fs.existsSync(fixtureRoot)) {
		return { error: FIXTURE_SUITE_ABSENT, passing: [], failing: [] };
	}
	const entries = fs.readdirSync(fixtureRoot, { withFileTypes: true });
	const passing = [];
	const failing = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		if (entry.name.startsWith("passing-")) {
			passing.push(entry.name);
		} else if (entry.name.startsWith("failing-")) {
			failing.push(entry.name);
		}
	}
	passing.sort();
	failing.sort();
	if (passing.length === 0) {
		return { error: FIXTURE_SUITE_EMPTY_PASSING, passing, failing };
	}
	if (failing.length === 0) {
		return { error: FIXTURE_SUITE_EMPTY_FAILING, passing, failing };
	}
	return { error: null, passing, failing };
}

function collectRelativeFiles(root) {
	const files = collectFiles(root, {
		extensions: SOURCE_EXTENSIONS,
		includePackageJson: true,
	});
	return files.map((filePath) =>
		path.relative(root, filePath).split(path.sep).join(path.posix.sep),
	);
}

function readExpectedReason(fixtureDir) {
	const reasonPath = path.join(fixtureDir, "expected-reason.txt");
	if (!fs.existsSync(reasonPath)) {
		return null;
	}
	return fs.readFileSync(reasonPath, "utf8").trim().split(/\r?\n/)[0] ?? "";
}

export function evaluatePassingFixture(id, fixtureDir) {
	const beforeDir = path.join(fixtureDir, "before");
	const afterDir = path.join(fixtureDir, "after");
	if (!fs.existsSync(afterDir)) {
		return { ok: false, reason: `${FIXTURE_MISSING_AFTER}: ${id}` };
	}
	const tmp = fs.mkdtempSync(
		path.join(os.tmpdir(), `pen-migrate-imports-v3-${id}-`),
	);
	fs.cpSync(beforeDir, tmp, { recursive: true });
	const rewritten = rewriteTree(tmp);
	if (!rewritten.ok) {
		return {
			ok: false,
			reason: `fixture ${id}: ${rewritten.reasons[0]}`,
		};
	}
	const expectedFiles = collectRelativeFiles(afterDir);
	const actualFiles = collectRelativeFiles(tmp);
	for (const relPath of expectedFiles) {
		if (!actualFiles.includes(relPath)) {
			return { ok: false, reason: formatFixtureMismatch(id, relPath) };
		}
		const expected = fs.readFileSync(path.join(afterDir, relPath), "utf8");
		const actual = fs.readFileSync(path.join(tmp, relPath), "utf8");
		if (expected !== actual) {
			return { ok: false, reason: formatFixtureMismatch(id, relPath) };
		}
	}
	return { ok: true, reason: null };
}

export function evaluateFailingFixture(id, fixtureDir) {
	const expected = readExpectedReason(fixtureDir);
	if (expected == null || expected.length === 0) {
		return { ok: false, reason: `${FIXTURE_MISSING_REASON}: ${id}` };
	}
	const beforeDir = path.join(fixtureDir, "before");
	const tmp = fs.mkdtempSync(
		path.join(os.tmpdir(), `pen-migrate-imports-v3-${id}-`),
	);
	fs.cpSync(beforeDir, tmp, { recursive: true });
	const rewritten = rewriteTree(tmp);
	if (rewritten.ok) {
		return {
			ok: false,
			reason: `fixture ${id}: ${FIXTURE_EXPECTED_FAILURE}`,
		};
	}
	const actual = rewritten.reasons[0] ?? "";
	if (!actual.includes(expected)) {
		return {
			ok: false,
			reason: `fixture ${id}: expected "${expected}", got "${actual}"`,
		};
	}
	return { ok: true, reason: actual };
}

export function runFixtureSuite(fixtureRoot = FIXTURE_ROOT) {
	const listed = listFixtureDirs(fixtureRoot);
	if (listed.error) {
		return { ok: false, error: listed.error, results: [] };
	}
	const results = [];
	for (const id of listed.passing) {
		const result = evaluatePassingFixture(id, path.join(fixtureRoot, id));
		results.push({ id, kind: "passing", ...result });
	}
	for (const id of listed.failing) {
		const result = evaluateFailingFixture(id, path.join(fixtureRoot, id));
		results.push({ id, kind: "failing", ...result });
	}
	const ok = results.every((result) => result.ok);
	return {
		ok,
		error: ok ? null : "one or more fixtures did not pass",
		results,
	};
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTests(fixtureRoot = FIXTURE_ROOT) {
	try {
		parseArgs(["--nope"]);
		throw new Error("self-test: unknown flag must throw");
	} catch (error) {
		assert(
			error instanceof Error && error.message.startsWith(UNKNOWN_FLAG),
			`self-test: unknown flag, got ${error instanceof Error ? error.message : error}`,
		);
	}
	try {
		parseArgs(["--check", "--write"]);
		throw new Error("self-test: mutex must throw");
	} catch (error) {
		assert(
			error instanceof Error && error.message === CHECK_WRITE_MUTEX,
			`self-test: mutex, got ${error instanceof Error ? error.message : error}`,
		);
	}
	try {
		parseArgs(["--write"]);
		throw new Error("self-test: write without target must throw");
	} catch (error) {
		assert(
			error instanceof Error && error.message === WRITE_WITHOUT_TARGET,
			`self-test: write without target, got ${error instanceof Error ? error.message : error}`,
		);
	}

	const emptyCensus = censusRoots([
		path.join(os.tmpdir(), `pen-migrate-imports-v3-absent-${process.pid}`),
	]);
	assert(!emptyCensus.ok, "self-test: absent scan root must fail");
	assert(
		emptyCensus.reason?.startsWith(CHECK_ROOT_MISSING) === true,
		`self-test: absent scan root reason, got ${emptyCensus.reason}`,
	);

	const emptyDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "pen-migrate-imports-v3-empty-"),
	);
	const emptyScan = censusRoots([emptyDir]);
	assert(!emptyScan.ok, "self-test: empty scan root must fail");
	assert(
		emptyScan.reason === CHECK_EMPTY_SCAN,
		`self-test: empty scan reason, got ${emptyScan.reason}`,
	);

	const missingSuite = runFixtureSuite(
		path.join(
			os.tmpdir(),
			`pen-migrate-imports-v3-nofixtures-${process.pid}`,
		),
	);
	assert(!missingSuite.ok, "self-test: absent fixture suite must fail");
	assert(
		missingSuite.error === FIXTURE_SUITE_ABSENT,
		`self-test: absent fixture suite reason, got ${missingSuite.error}`,
	);

	const suite = runFixtureSuite(fixtureRoot);
	assert(suite.ok, `self-test: fixture suite failed: ${formatSuite(suite)}`);
	for (const result of suite.results) {
		assert(result.ok, `self-test: fixture ${result.id} must pass`);
	}
	assert(
		suite.results.some((result) => result.id === "passing-string-literal"),
		"self-test: string-literal fixture must be present",
	);
	assert(
		suite.results.some(
			(result) => result.id === "failing-manifest-version-conflict",
		),
		"self-test: version-conflict fixture must be present",
	);
	assert(
		suite.results.some((result) => result.id === "failing-deep-import"),
		"self-test: deep-import fixture must be present",
	);
	return suite;
}

function formatSuite(suite) {
	const lines = [];
	for (const result of suite.results) {
		lines.push(
			`${result.ok ? "pass" : "fail"}  ${result.id}${result.reason ? `  ${result.reason}` : ""}`,
		);
	}
	if (suite.error) {
		lines.push(suite.error);
	}
	return lines.join("\n");
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

	try {
		runSelfTests();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
		return;
	}
	console.log(
		"migrate-imports-v3 self-test ok (string literals preserved; manifest merge de-duplicates; version-range conflict and deep import fail closed)",
	);

	if (!args.check && !args.write) {
		return;
	}

	if (args.check) {
		const roots =
			args.paths.length > 0
				? resolveTargets(args.repoRoot, args.paths)
				: [
						path.join(args.repoRoot, "packages"),
						path.join(args.repoRoot, "playground"),
					];
		const result = censusRoots(roots);
		console.log(result.population);
		if (!result.ok) {
			console.error(result.reason);
			process.exitCode = 1;
			return;
		}
	}

	if (args.write) {
		const targets = resolveTargets(args.repoRoot, args.paths);
		const reasons = [];
		let written = 0;
		for (const target of targets) {
			if (!fs.existsSync(target)) {
				reasons.push(`${WRITE_PATH_MISSING}: ${target}`);
				continue;
			}
			const result = rewriteTree(target);
			written += result.written.length;
			if (!result.ok) {
				reasons.push(...result.reasons);
			}
		}
		if (reasons.length > 0) {
			for (const reason of reasons) {
				console.error(reason);
			}
			process.exitCode = 1;
			return;
		}
		console.log(`wrote ${written} file(s)`);
	}
}

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
	main();
}
