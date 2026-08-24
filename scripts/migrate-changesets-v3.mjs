#!/usr/bin/env node
/**
 * Wave 6 changeset frontmatter migration (spec-v3/05-surface.md SF1/SF2,
 * spec-v3/plans/wave-6-changeset-migration.md Option A).
 *
 * Rewrites retired satellite package keys onto `@input/pen-ai` and
 * `@input/pen-interop`. Frontmatter keys only — body prose stays put
 * (the red-proof). Collapsing keys de-duplicate onto one line and take
 * the highest bump (major > minor > patch).
 *
 * `--check` / `--dry-run` is a frontmatter census (read-only). `--write`
 * applies the rewrite to explicit target paths. Default / `--self-test`
 * runs the fixture suite. Do not `--write` the live `.changeset/` queue
 * until the Wave 6 package merge deletes the satellites.
 *
 * SF2 population regenerated 2026-08-24 via
 * `ls packages/extensions | rg '^(import|export)-'`:
 * export-html, export-json, export-markdown, export-xml,
 * import-html, import-json, import-markdown.
 * markdown-serialization does not fold (document-ops consumes it).
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
	"migrate-changesets-v3",
);

export const SF1_REWRITE = {
	"@input/pen-ai-suggestions": "@input/pen-ai",
	"@input/pen-ai-autocomplete": "@input/pen-ai",
	"@input/pen-ai-skills": "@input/pen-ai",
	"@input/pen-ai-tools": "@input/pen-ai",
	"@input/pen-delta-stream": "@input/pen-ai",
};

export const SF2_DIRECTORIES = [
	"export-html",
	"export-json",
	"export-markdown",
	"export-xml",
	"import-html",
	"import-json",
	"import-markdown",
];

export const SF2_REWRITE = Object.fromEntries(
	SF2_DIRECTORIES.map((dir) => [`@input/pen-${dir}`, "@input/pen-interop"]),
);

export const PACKAGE_REWRITE = { ...SF1_REWRITE, ...SF2_REWRITE };

const SF1_NAMES = new Set(Object.keys(SF1_REWRITE));
const SF2_NAMES = new Set(Object.keys(SF2_REWRITE));

const BUMP_RANK = {
	patch: 1,
	minor: 2,
	major: 3,
};

const ENTRY_RE = /^(\s*)(['"]?)(@input\/pen-[a-z0-9-]+)\2(\s*:\s*)(\S+)(\s*)$/;

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
	"cannot run: --check/--dry-run and --write are mutually exclusive";
export const WRITE_WITHOUT_TARGET = "cannot write: no target path given";
export const WRITE_PATH_MISSING = "cannot write: path does not exist";
export const LIVE_QUEUE_REFUSAL =
	"cannot write: live .changeset queue; rewrite only after the Wave 6 package merge (pass --force)";
export const CHECK_ROOT_MISSING = "cannot check: scan root is absent";
export const CHECK_EMPTY_SCAN = "cannot check: scan roots matched 0 files";
export const FIXTURE_SUITE_ABSENT = "cannot check: fixture suite is absent";
export const FIXTURE_SUITE_EMPTY_PASSING =
	"cannot check: fixture suite has 0 passing fixtures";
export const FIXTURE_MISSING_AFTER =
	"cannot check: passing fixture has no after tree";
export const FIXTURE_MISMATCH =
	"rewritten output does not match expected after";
export const UNKNOWN_BUMP = "unknown bump";
export const SF2_POPULATION_DRIFT = "sf2 population drift";

export const REQUIRED_PASSING_FIXTURES = [
	"passing-single",
	"passing-collapse",
	"passing-bump-conflict",
	"passing-body-prose",
	"passing-mixed",
	"passing-noop",
];

export const USAGE =
	"Usage: node scripts/migrate-changesets-v3.mjs [--self-test] [--check|--dry-run [dir...]] [--write <dir...>] [--force] [--repo-root <dir>]";

export function parseArgs(argv, repoRoot = DEFAULT_REPO_ROOT) {
	let check = false;
	let write = false;
	let selfTest = false;
	let force = false;
	let root = repoRoot;
	const paths = [];
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--check" || arg === "--dry-run") {
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
		if (arg === "--force") {
			force = true;
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
	return { check, write, selfTest, force, repoRoot: root, paths };
}

export function listSf2Directories(extensionsDir) {
	if (!fs.existsSync(extensionsDir)) {
		return [];
	}
	return fs
		.readdirSync(extensionsDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() && /^(import|export)-/.test(entry.name),
		)
		.map((entry) => entry.name)
		.sort();
}

export function verifySf2Population(repoRoot = DEFAULT_REPO_ROOT) {
	const live = listSf2Directories(
		path.join(repoRoot, "packages", "extensions"),
	);
	if (live.length === 0) {
		return { ok: true, skipped: true, live, expected: SF2_DIRECTORIES };
	}
	const expected = [...SF2_DIRECTORIES].sort();
	if (live.length !== expected.length) {
		return {
			ok: false,
			skipped: false,
			live,
			expected,
			reason: `${SF2_POPULATION_DRIFT}: live [${live.join(", ")}] vs ${expected.join(", ")}`,
		};
	}
	for (let i = 0; i < live.length; i += 1) {
		if (live[i] !== expected[i]) {
			return {
				ok: false,
				skipped: false,
				live,
				expected,
				reason: `${SF2_POPULATION_DRIFT}: live [${live.join(", ")}] vs ${expected.join(", ")}`,
			};
		}
	}
	return { ok: true, skipped: false, live, expected };
}

/**
 * @param {"major" | "minor" | "patch"} bump
 */
export function bumpRank(bump) {
	switch (bump) {
		case "patch":
			return BUMP_RANK.patch;
		case "minor":
			return BUMP_RANK.minor;
		case "major":
			return BUMP_RANK.major;
		default: {
			const _never = bump;
			throw new Error(`${UNKNOWN_BUMP}: ${_never}`);
		}
	}
}

export function isKnownBump(bump) {
	return bump === "patch" || bump === "minor" || bump === "major";
}

export function maxBump(left, right) {
	if (!isKnownBump(left) || !isKnownBump(right)) {
		return {
			ok: false,
			reason: `${UNKNOWN_BUMP}: ${left} / ${right}`,
		};
	}
	return {
		ok: true,
		bump: bumpRank(left) >= bumpRank(right) ? left : right,
	};
}

export function parseFrontmatterEntry(line) {
	const match = ENTRY_RE.exec(line);
	if (!match) {
		return null;
	}
	const nameStart = match[1].length + match[2].length;
	const nameEnd = nameStart + match[3].length;
	const bumpStart = nameEnd + match[2].length + match[4].length;
	const bumpEnd = bumpStart + match[5].length;
	return {
		line,
		indent: match[1],
		quote: match[2],
		name: match[3],
		separator: match[4],
		bump: match[5],
		trailing: match[6],
		nameStart,
		nameEnd,
		bumpStart,
		bumpEnd,
	};
}

export function replaceEntryName(entry, name) {
	return (
		entry.line.slice(0, entry.nameStart) +
		name +
		entry.line.slice(entry.nameEnd)
	);
}

export function replaceEntryBump(line, bump) {
	const entry = parseFrontmatterEntry(line);
	if (!entry) {
		return line;
	}
	return (
		entry.line.slice(0, entry.bumpStart) +
		bump +
		entry.line.slice(entry.bumpEnd)
	);
}

export function splitChangeset(text) {
	if (!text.startsWith("---")) {
		return null;
	}
	const close = text.indexOf("\n---", 3);
	if (close === -1) {
		return null;
	}
	const front = text.slice(4, close);
	const afterClose = text.slice(close + 4);
	return { front, afterClose };
}

export function joinChangeset(front, afterClose) {
	if (front === "") {
		return `---\n---${afterClose}`;
	}
	return `---\n${front}\n---${afterClose}`;
}

export function listFrontmatterPackages(text) {
	const split = splitChangeset(text);
	if (!split || split.front === "") {
		return [];
	}
	const names = [];
	for (const line of split.front.split("\n")) {
		const entry = parseFrontmatterEntry(line);
		if (entry) {
			names.push(entry.name);
		}
	}
	return names;
}

export function classifyPackages(names) {
	let ai = false;
	let interop = false;
	for (const name of names) {
		if (SF1_NAMES.has(name)) {
			ai = true;
		}
		if (SF2_NAMES.has(name)) {
			interop = true;
		}
	}
	return { ai, interop, affected: ai || interop };
}

export function rewriteFrontmatter(front) {
	if (front === "") {
		return { ok: true, front, changed: false };
	}
	const lines = front.split("\n");
	const out = [];
	const targetIndex = new Map();
	let changed = false;

	for (const line of lines) {
		const entry = parseFrontmatterEntry(line);
		if (!entry) {
			out.push(line);
			continue;
		}
		const mapped = Object.hasOwn(PACKAGE_REWRITE, entry.name);
		const target = mapped ? PACKAGE_REWRITE[entry.name] : entry.name;
		const existing = targetIndex.get(target);
		if (existing != null) {
			const prevLine = out[existing];
			const prev = parseFrontmatterEntry(prevLine);
			if (!prev) {
				out.push(line);
				continue;
			}
			const merged = maxBump(prev.bump, entry.bump);
			if (!merged.ok) {
				return merged;
			}
			if (merged.bump !== prev.bump) {
				out[existing] = replaceEntryBump(prevLine, merged.bump);
			}
			changed = true;
			continue;
		}
		if (mapped) {
			out.push(replaceEntryName(entry, target));
			targetIndex.set(target, out.length - 1);
			changed = true;
			continue;
		}
		out.push(line);
		targetIndex.set(target, out.length - 1);
	}

	return { ok: true, front: out.join("\n"), changed };
}

export function rewriteChangesetText(text) {
	const split = splitChangeset(text);
	if (!split) {
		return { ok: true, text, changed: false };
	}
	const rewritten = rewriteFrontmatter(split.front);
	if (!rewritten.ok) {
		return rewritten;
	}
	if (!rewritten.changed) {
		return { ok: true, text, changed: false };
	}
	const next = joinChangeset(rewritten.front, split.afterClose);
	return { ok: true, text: next, changed: next !== text };
}

function collectChangesetFiles(root) {
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
			if (entry.name === "README.md" || !entry.name.endsWith(".md")) {
				continue;
			}
			found.push(entryPath);
		}
	}

	walk(root);
	found.sort((left, right) => left.localeCompare(right));
	return found;
}

export function listTargetFiles(root) {
	const stat = fs.statSync(root);
	if (stat.isFile()) {
		return [root];
	}
	return collectChangesetFiles(root);
}

export function rewriteTree(root) {
	const files = listTargetFiles(root);
	const written = [];
	const reasons = [];
	for (const filePath of files) {
		const text = fs.readFileSync(filePath, "utf8");
		const result = rewriteChangesetText(text);
		if (!result.ok) {
			reasons.push(`${result.reason}: ${filePath}`);
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

export function formatPopulation(result) {
	return `population: ${result.affected} affected files (${result.ai} ai + ${result.interop} interop − ${result.overlap} overlap) of ${result.pending} pending`;
}

export function censusRoots(roots) {
	const missing = [];
	const files = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) {
			missing.push(root);
			continue;
		}
		files.push(...listTargetFiles(root));
	}
	if (missing.length > 0) {
		return {
			ok: false,
			reason: `${CHECK_ROOT_MISSING}: ${missing[0]}`,
			population: formatPopulation({
				affected: 0,
				ai: 0,
				interop: 0,
				overlap: 0,
				pending: 0,
			}),
			affected: 0,
			ai: 0,
			interop: 0,
			overlap: 0,
			pending: 0,
			wouldRewrite: 0,
			overlapFiles: [],
			affectedFiles: [],
		};
	}
	if (files.length === 0) {
		return {
			ok: false,
			reason: CHECK_EMPTY_SCAN,
			population: formatPopulation({
				affected: 0,
				ai: 0,
				interop: 0,
				overlap: 0,
				pending: 0,
			}),
			affected: 0,
			ai: 0,
			interop: 0,
			overlap: 0,
			pending: 0,
			wouldRewrite: 0,
			overlapFiles: [],
			affectedFiles: [],
		};
	}

	let ai = 0;
	let interop = 0;
	let overlap = 0;
	let affected = 0;
	let wouldRewrite = 0;
	const overlapFiles = [];
	const affectedFiles = [];
	for (const filePath of files) {
		const text = fs.readFileSync(filePath, "utf8");
		const names = listFrontmatterPackages(text);
		const classified = classifyPackages(names);
		if (classified.ai) {
			ai += 1;
		}
		if (classified.interop) {
			interop += 1;
		}
		if (classified.ai && classified.interop) {
			overlap += 1;
			overlapFiles.push(filePath);
		}
		if (classified.affected) {
			affected += 1;
			affectedFiles.push(filePath);
		}
		const rewritten = rewriteChangesetText(text);
		if (rewritten.ok && rewritten.changed) {
			wouldRewrite += 1;
		}
	}

	return {
		ok: true,
		reason: null,
		population: formatPopulation({
			affected,
			ai,
			interop,
			overlap,
			pending: files.length,
		}),
		affected,
		ai,
		interop,
		overlap,
		pending: files.length,
		wouldRewrite,
		overlapFiles,
		affectedFiles,
	};
}

function listFixtureDirs(fixtureRoot) {
	if (!fs.existsSync(fixtureRoot)) {
		return { error: FIXTURE_SUITE_ABSENT, passing: [] };
	}
	const entries = fs.readdirSync(fixtureRoot, { withFileTypes: true });
	const passing = [];
	for (const entry of entries) {
		if (entry.isDirectory() && entry.name.startsWith("passing-")) {
			passing.push(entry.name);
		}
	}
	passing.sort();
	if (passing.length === 0) {
		return { error: FIXTURE_SUITE_EMPTY_PASSING, passing };
	}
	return { error: null, passing };
}

function collectRelativeFiles(root) {
	const files = collectChangesetFiles(root);
	return files.map((filePath) =>
		path.relative(root, filePath).split(path.sep).join(path.posix.sep),
	);
}

export function evaluatePassingFixture(id, fixtureDir) {
	const beforeDir = path.join(fixtureDir, "before");
	const afterDir = path.join(fixtureDir, "after");
	if (!fs.existsSync(afterDir)) {
		return { ok: false, reason: `${FIXTURE_MISSING_AFTER}: ${id}` };
	}
	const tmp = fs.mkdtempSync(
		path.join(os.tmpdir(), `pen-migrate-changesets-v3-${id}-`),
	);
	try {
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
				return {
					ok: false,
					reason: `fixture ${id}: ${FIXTURE_MISMATCH} (${relPath})`,
				};
			}
			const expected = fs.readFileSync(
				path.join(afterDir, relPath),
				"utf8",
			);
			const actual = fs.readFileSync(path.join(tmp, relPath), "utf8");
			if (expected !== actual) {
				return {
					ok: false,
					reason: `fixture ${id}: ${FIXTURE_MISMATCH} (${relPath})`,
				};
			}
		}
		return { ok: true, reason: null };
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
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
	const ok = results.every((result) => result.ok);
	return {
		ok,
		error: ok ? null : "one or more fixtures did not pass",
		results,
	};
}

function readFixtureFile(fixtureRoot, id, side) {
	const dir = path.join(fixtureRoot, id, side);
	const files = collectRelativeFiles(dir);
	if (files.length === 0) {
		throw new Error(`self-test: fixture ${id} ${side} has no changeset`);
	}
	return fs.readFileSync(path.join(dir, files[0]), "utf8");
}

function rewriteFrontmatterNaive(front, map, options) {
	const lines = front === "" ? [] : front.split("\n");
	const out = [];
	const seen = new Map();
	for (const line of lines) {
		const entry = parseFrontmatterEntry(line);
		if (!entry) {
			out.push(line);
			continue;
		}
		const target = Object.hasOwn(map, entry.name)
			? map[entry.name]
			: entry.name;
		if (options.dropSurvivors && !Object.hasOwn(map, entry.name)) {
			continue;
		}
		if (options.dedupe && seen.has(target)) {
			if (options.bump === "first") {
				continue;
			}
			const prevIndex = seen.get(target);
			const prev = parseFrontmatterEntry(out[prevIndex]);
			if (prev && options.bump === "highest") {
				const merged = maxBump(prev.bump, entry.bump);
				if (merged.ok && merged.bump !== prev.bump) {
					out[prevIndex] = replaceEntryBump(
						out[prevIndex],
						merged.bump,
					);
				}
			}
			continue;
		}
		const nextLine =
			target === entry.name ? line : replaceEntryName(entry, target);
		if (options.dedupe) {
			seen.set(target, out.length);
		}
		out.push(nextLine);
	}
	return out.join("\n");
}

function rewriteWith(text, map, options) {
	const split = splitChangeset(text);
	if (!split) {
		return text;
	}
	const front = rewriteFrontmatterNaive(split.front, map, options);
	let afterClose = split.afterClose;
	if (options.rewriteBody) {
		for (const oldName of Object.keys(map)) {
			afterClose = afterClose.split(oldName).join(map[oldName]);
		}
	}
	return joinChangeset(front, afterClose);
}

export function brokenRewrites() {
	return {
		"passing-single": (text) =>
			rewriteWith(text, {}, { dedupe: true, bump: "highest" }),
		"passing-collapse": (text) =>
			rewriteWith(text, PACKAGE_REWRITE, {
				dedupe: false,
				bump: "highest",
			}),
		"passing-bump-conflict": (text) =>
			rewriteWith(text, PACKAGE_REWRITE, {
				dedupe: true,
				bump: "first",
			}),
		"passing-body-prose": (text) =>
			rewriteWith(text, PACKAGE_REWRITE, {
				dedupe: true,
				bump: "highest",
				rewriteBody: true,
			}),
		"passing-mixed": (text) =>
			rewriteWith(text, PACKAGE_REWRITE, {
				dedupe: true,
				bump: "highest",
				dropSurvivors: true,
			}),
		"passing-noop": (text) =>
			rewriteWith(
				text,
				{
					...PACKAGE_REWRITE,
					"@input/pen-markdown-serialization": "@input/pen-interop",
				},
				{ dedupe: true, bump: "highest" },
			),
	};
}

export function proveBrokenRewrite(id, fixtureRoot = FIXTURE_ROOT) {
	const broken = brokenRewrites()[id];
	if (!broken) {
		return {
			ok: false,
			reason: `self-test: no broken rewrite for ${id}`,
		};
	}
	const before = readFixtureFile(fixtureRoot, id, "before");
	const after = readFixtureFile(fixtureRoot, id, "after");
	const correct = rewriteChangesetText(before);
	if (!correct.ok) {
		return {
			ok: false,
			reason: `self-test: correct rewrite failed for ${id}: ${correct.reason}`,
		};
	}
	if (correct.text !== after) {
		return {
			ok: false,
			reason: `self-test: correct rewrite misses ${id} after`,
		};
	}
	const brokenText = broken(before);
	if (brokenText === after) {
		return {
			ok: false,
			reason: `self-test: broken rewrite for ${id} still matches after (fixture does not catch the trap)`,
		};
	}
	return { ok: true, reason: null };
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTests(
	fixtureRoot = FIXTURE_ROOT,
	repoRoot = DEFAULT_REPO_ROOT,
) {
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
		parseArgs(["--dry-run", "--write"]);
		throw new Error("self-test: dry-run mutex must throw");
	} catch (error) {
		assert(
			error instanceof Error && error.message === CHECK_WRITE_MUTEX,
			`self-test: dry-run mutex, got ${error instanceof Error ? error.message : error}`,
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
		path.join(
			os.tmpdir(),
			`pen-migrate-changesets-v3-absent-${process.pid}`,
		),
	]);
	assert(!emptyCensus.ok, "self-test: absent scan root must fail");
	assert(
		emptyCensus.reason?.startsWith(CHECK_ROOT_MISSING) === true,
		`self-test: absent scan root reason, got ${emptyCensus.reason}`,
	);

	const emptyDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "pen-migrate-changesets-v3-empty-"),
	);
	try {
		const emptyScan = censusRoots([emptyDir]);
		assert(!emptyScan.ok, "self-test: empty scan root must fail");
		assert(
			emptyScan.reason === CHECK_EMPTY_SCAN,
			`self-test: empty scan reason, got ${emptyScan.reason}`,
		);
	} finally {
		fs.rmSync(emptyDir, { recursive: true, force: true });
	}

	const missingSuite = runFixtureSuite(
		path.join(
			os.tmpdir(),
			`pen-migrate-changesets-v3-nofixtures-${process.pid}`,
		),
	);
	assert(!missingSuite.ok, "self-test: absent fixture suite must fail");
	assert(
		missingSuite.error === FIXTURE_SUITE_ABSENT,
		`self-test: absent fixture suite reason, got ${missingSuite.error}`,
	);

	const sf2 = verifySf2Population(repoRoot);
	assert(
		sf2.ok,
		`self-test: ${sf2.reason ?? "sf2 population must match ls | rg"}`,
	);
	assert(
		!Object.hasOwn(PACKAGE_REWRITE, "@input/pen-markdown-serialization"),
		"self-test: markdown-serialization must not fold into pen-interop",
	);

	const quoted = rewriteChangesetText(
		'---\n"@input/pen-ai-tools": patch\n---\n\nHi.\n',
	);
	assert(
		quoted.ok && quoted.changed,
		"self-test: quoted rewrite must change",
	);
	assert(
		quoted.text === '---\n"@input/pen-ai": patch\n---\n\nHi.\n',
		"self-test: double quotes must be preserved",
	);
	const unquoted = rewriteChangesetText(
		"---\n@input/pen-export-html: minor\n---\n\nHi.\n",
	);
	assert(
		unquoted.ok &&
			unquoted.text === "---\n@input/pen-interop: minor\n---\n\nHi.\n",
		"self-test: unquoted keys must stay unquoted",
	);
	const singleQuoted = rewriteChangesetText(
		"---\n'@input/pen-ai-tools': patch\n---\n\nHi.\n",
	);
	assert(
		singleQuoted.ok &&
			singleQuoted.text === "---\n'@input/pen-ai': patch\n---\n\nHi.\n",
		"self-test: single quotes must be preserved",
	);

	const merged = maxBump("patch", "minor");
	assert(
		merged.ok && merged.bump === "minor",
		"self-test: patch + minor must be minor",
	);
	const majorWins = maxBump("major", "minor");
	assert(
		majorWins.ok && majorWins.bump === "major",
		"self-test: major must outrank minor",
	);

	const suite = runFixtureSuite(fixtureRoot);
	assert(suite.ok, `self-test: fixture suite failed: ${formatSuite(suite)}`);
	for (const result of suite.results) {
		assert(result.ok, `self-test: fixture ${result.id} must pass`);
	}
	for (const id of REQUIRED_PASSING_FIXTURES) {
		assert(
			suite.results.some((result) => result.id === id),
			`self-test: ${id} fixture must be present`,
		);
	}

	const bodyAfter = path.join(fixtureRoot, "passing-body-prose", "after");
	const bodyCensus = censusRoots([bodyAfter]);
	assert(bodyCensus.ok, "self-test: body-prose after census must run");
	assert(
		bodyCensus.affected === 0,
		`self-test: body-prose after must not be a frontmatter hit, got ${bodyCensus.affected}`,
	);
	assert(
		bodyCensus.wouldRewrite === 0,
		"self-test: body-prose after must be a no-write",
	);

	const noopAfter = path.join(fixtureRoot, "passing-noop", "after");
	const noopCensus = censusRoots([noopAfter]);
	assert(
		noopCensus.ok &&
			noopCensus.affected === 0 &&
			noopCensus.wouldRewrite === 0,
		"self-test: noop after must be unaffected",
	);

	const breakProofs = [];
	for (const id of REQUIRED_PASSING_FIXTURES) {
		const proof = proveBrokenRewrite(id, fixtureRoot);
		assert(proof.ok, proof.reason ?? `self-test: break-proof ${id} failed`);
		breakProofs.push(id);
	}
	assert(
		breakProofs.length === REQUIRED_PASSING_FIXTURES.length,
		"self-test: every required fixture must have a break-proof",
	);

	return { suite, breakProofs };
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

function isLiveChangesetQueue(repoRoot, target) {
	const live = path.resolve(repoRoot, ".changeset");
	const resolved = path.resolve(target);
	return resolved === live;
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
		const self = runSelfTests();
		console.log(formatSuite(self.suite));
		for (const id of self.breakProofs) {
			console.log(`break-proof  ${id}`);
		}
		console.log(
			"migrate-changesets-v3 self-test ok (single, collapse, bump-conflict, body-prose, mixed, no-op; each fails by name when the rewrite is broken)",
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
		return;
	}

	if (!args.check && !args.write) {
		return;
	}

	if (args.check) {
		const roots =
			args.paths.length > 0
				? resolveTargets(args.repoRoot, args.paths)
				: [path.join(args.repoRoot, ".changeset")];
		const result = censusRoots(roots);
		console.log(result.population);
		console.log(
			`dedupe: union = ai + interop − overlap (${result.ai} + ${result.interop} − ${result.overlap} = ${result.affected})`,
		);
		console.log(`would rewrite: ${result.wouldRewrite} file(s)`);
		if (result.overlapFiles.length > 0) {
			console.log(
				`overlap files: ${result.overlapFiles
					.map((filePath) => path.basename(filePath))
					.sort()
					.join(", ")}`,
			);
		}
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
			if (!args.force && isLiveChangesetQueue(args.repoRoot, target)) {
				reasons.push(LIVE_QUEUE_REFUSAL);
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
