#!/usr/bin/env node
/**
 * SF3 closed package list (spec-v3/05-surface.md, Wave 6).
 *
 * After the SF1/SF2 merges the workspace package list (named manifests
 * under packages/, private included) must equal the closed no-merge list
 * plus the two merge targets. Extending that list is a spec amendment.
 *
 * Enumeration is loadTaskGraphPackages from dag-check.mjs — the same
 * recursive packages/ walk workspace-pins and the DAG check use. Do not
 * invent a third walker. pnpm-workspace.yaml is packages/** plus
 * examples and playground; those last four are outside this walk on
 * purpose (they are not product packages).
 *
 * Frozen 2026-08-24 from that walk minus the twelve satellites minus
 * @input/pen-ai. Re-derive only if 05-surface.md is amended.
 *
 * Fail-closed: an empty closed list, an empty spec parse, or a walk
 * that finds zero packages is an error, never a pass.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTaskGraphPackages } from "./dag-check.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SPEC = path.join("spec-v3", "05-surface.md");

const MERGE_TARGET_AI = "@input/pen-ai";
const MERGE_TARGET_INTEROP = "@input/pen-interop";

const SF1_SATELLITES = [
	"@input/pen-ai-suggestions",
	"@input/pen-ai-autocomplete",
	"@input/pen-ai-skills",
	"@input/pen-ai-tools",
	"@input/pen-delta-stream",
];

const SF2_SATELLITES = [
	"@input/pen-export-html",
	"@input/pen-export-json",
	"@input/pen-export-markdown",
	"@input/pen-export-xml",
	"@input/pen-import-html",
	"@input/pen-import-json",
	"@input/pen-import-markdown",
];

/**
 * Named packages under packages/ that are not an SF1/SF2 satellite
 * and not a merge target. Measured 2026-08-24 via loadTaskGraphPackages
 * (38 names) minus 12 satellites minus @input/pen-ai.
 *
 * spec-v3/05-surface.md SF3 names categories, not this list. The
 * sentence is "nothing else merges"; the npm names are the remainder.
 */
const CLOSED_NO_MERGE = [
	"@input/pen-assets-memory",
	"@input/pen-bench",
	"@input/pen-conformance",
	"@input/pen-content-ops",
	"@input/pen-core",
	"@input/pen-crdt-yjs",
	"@input/pen-docs",
	"@input/pen-document-ops",
	"@input/pen-dom",
	"@input/pen-eslint-plugin",
	"@input/pen-history",
	"@input/pen-input-rules",
	"@input/pen-markdown-serialization",
	"@input/pen-multiplayer",
	"@input/pen-preset-default",
	"@input/pen-react",
	"@input/pen-schema-default",
	"@input/pen-search",
	"@input/pen-shortcuts",
	"@input/pen-test",
	"@input/pen-transport-direct",
	"@input/pen-transport-sse",
	"@input/pen-types",
	"@input/pen-undo",
	"@input/pen-vue",
];

const EMPTY_CLOSED =
	"sf3-package-list-check: cannot check: closed no-merge list is empty";
const EMPTY_LIVE =
	"sf3-package-list-check: cannot check: packages/**/package.json walk matched 0 files";
const EMPTY_TARGETS =
	"sf3-package-list-check: cannot check: spec-v3/05-surface.md named 0 merge targets";
const EMPTY_SF1 =
	"sf3-package-list-check: cannot check: spec-v3/05-surface.md named 0 SF1 satellites";

export function parseSurfaceSpec(text) {
	if (typeof text !== "string" || text.trim().length === 0) {
		return { targets: [], sf1Satellites: [], sf2Mentioned: false };
	}

	const targets = [];
	if (text.includes(`\`${MERGE_TARGET_AI}\``)) {
		targets.push(MERGE_TARGET_AI);
	}
	if (text.includes(`\`${MERGE_TARGET_INTEROP}\``)) {
		targets.push(MERGE_TARGET_INTEROP);
	}

	const sf1Satellites = SF1_SATELLITES.filter((name) =>
		text.includes(`\`${name}\``),
	);

	return {
		targets,
		sf1Satellites,
		sf2Mentioned: /import\/export/i.test(text) || /SF2/.test(text),
	};
}

export function expectedNames(closedNoMerge, targets) {
	return uniqueSorted([...(closedNoMerge ?? []), ...(targets ?? [])]);
}

export function comparePackageLists({ live, expected }) {
	const liveSet = new Set(live);
	const expectedSet = new Set(expected);
	const unexpected = [...liveSet].filter((name) => !expectedSet.has(name));
	const missing = [...expectedSet].filter((name) => !liveSet.has(name));
	unexpected.sort();
	missing.sort();
	return {
		unexpected,
		missing,
		ok: unexpected.length === 0 && missing.length === 0,
	};
}

export function formatReport(result, { liveCount, expectedCount } = {}) {
	const lines = ["SF3 workspace package list"];
	lines.push("");
	if (typeof liveCount === "number" && typeof expectedCount === "number") {
		lines.push(`live       ${liveCount}`);
		lines.push(`expected   ${expectedCount}`);
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unexpected package(s) (not on the closed SF3 list plus merge targets):",
		);
		for (const name of result.unexpected) {
			lines.push(`  ${name}`);
		}
	}

	if (result.missing.length > 0) {
		lines.push("");
		lines.push(
			"FAIL missing package(s) (required by the closed SF3 list plus merge targets):",
		);
		for (const name of result.missing) {
			lines.push(`  ${name}`);
		}
	}

	if (result.ok) {
		lines.push("");
		lines.push(
			`OK: live workspace list matches the closed no-merge list plus ${MERGE_TARGET_AI} and ${MERGE_TARGET_INTEROP}.`,
		);
	}

	return lines.join("\n");
}

export async function runCheck({
	repoRoot,
	specPath,
	closedNoMerge = CLOSED_NO_MERGE,
	mergeTargets,
	specText,
} = {}) {
	if (!Array.isArray(closedNoMerge) || closedNoMerge.length === 0) {
		return cannotCheck(EMPTY_CLOSED);
	}

	let targets = mergeTargets;
	let parsed = null;
	if (targets == null) {
		const text =
			specText ??
			readSpec(
				specPath ??
					path.join(repoRoot ?? DEFAULT_REPO_ROOT, DEFAULT_SPEC),
			);
		parsed = parseSurfaceSpec(text);
		if (parsed.targets.length === 0) {
			return cannotCheck(EMPTY_TARGETS);
		}
		if (parsed.sf1Satellites.length === 0) {
			return cannotCheck(EMPTY_SF1);
		}
		targets = parsed.targets;
	}

	if (!Array.isArray(targets) || targets.length === 0) {
		return cannotCheck(EMPTY_TARGETS);
	}

	const satelliteInClosed = [...SF1_SATELLITES, ...SF2_SATELLITES].filter(
		(name) => closedNoMerge.includes(name),
	);
	if (satelliteInClosed.length > 0) {
		return cannotCheck(
			`sf3-package-list-check: cannot check: closed no-merge list contains satellite(s): ${satelliteInClosed.join(", ")}`,
		);
	}

	let packages;
	try {
		packages = await loadTaskGraphPackages(repoRoot);
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return cannotCheck(EMPTY_LIVE);
		}
		throw error;
	}

	if (packages.length === 0) {
		return cannotCheck(EMPTY_LIVE);
	}

	const live = uniqueSorted(packages.map((pkg) => pkg.name));
	const expected = expectedNames(closedNoMerge, targets);
	if (expected.length === 0) {
		return cannotCheck(EMPTY_CLOSED);
	}

	const compared = comparePackageLists({ live, expected });
	return {
		ok: compared.ok,
		error: null,
		unexpected: compared.unexpected,
		missing: compared.missing,
		live,
		expected,
		parsed,
		report: formatReport(compared, {
			liveCount: live.length,
			expectedCount: expected.length,
		}),
	};
}

function cannotCheck(error) {
	return {
		ok: false,
		error,
		unexpected: [],
		missing: [],
		live: [],
		expected: [],
		parsed: null,
		report: error,
	};
}

function readSpec(specPath) {
	try {
		return fs.readFileSync(specPath, "utf8");
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return "";
		}
		throw error;
	}
}

function uniqueSorted(names) {
	return [...new Set(names)].sort();
}

export function runSelfTests(repoRoot = DEFAULT_REPO_ROOT) {
	const parsed = parseSurfaceSpec(
		fs.readFileSync(path.join(repoRoot, DEFAULT_SPEC), "utf8"),
	);
	assert(
		parsed.targets.includes(MERGE_TARGET_AI) &&
			parsed.targets.includes(MERGE_TARGET_INTEROP),
		"self-test: 05-surface.md must name both merge targets",
	);
	assert(
		parsed.sf1Satellites.length === SF1_SATELLITES.length,
		"self-test: 05-surface.md must name the five SF1 satellites",
	);
	assert(
		CLOSED_NO_MERGE.length > 0,
		"self-test: frozen closed list must be non-empty",
	);

	assert(
		expectedNames([], [MERGE_TARGET_AI]).length === 1,
		"self-test: empty closed list plus one target is not the empty-closed error path",
	);

	const unexpected = comparePackageLists({
		live: [
			"@input/pen-core",
			MERGE_TARGET_AI,
			MERGE_TARGET_INTEROP,
			"@input/pen-sf3-unexpected",
		],
		expected: expectedNames(
			["@input/pen-core"],
			[MERGE_TARGET_AI, MERGE_TARGET_INTEROP],
		),
	});
	assert(!unexpected.ok, "self-test: extra live name must fail");
	assert(
		unexpected.unexpected.join(",") === "@input/pen-sf3-unexpected",
		`self-test: unexpected name, got ${unexpected.unexpected.join(",")}`,
	);
	assert(
		unexpected.missing.length === 0,
		"self-test: unexpected fixture must not also be missing",
	);
	const unexpectedReport = formatReport(unexpected);
	assert(
		unexpectedReport.includes(
			"FAIL unexpected package(s) (not on the closed SF3 list plus merge targets):",
		) && unexpectedReport.includes("  @input/pen-sf3-unexpected"),
		`self-test: unexpected report, got ${unexpectedReport}`,
	);

	const missing = comparePackageLists({
		live: ["@input/pen-core", MERGE_TARGET_AI],
		expected: expectedNames(
			["@input/pen-core"],
			[MERGE_TARGET_AI, MERGE_TARGET_INTEROP],
		),
	});
	assert(!missing.ok, "self-test: absent expected name must fail");
	assert(
		missing.missing.join(",") === MERGE_TARGET_INTEROP,
		`self-test: missing name, got ${missing.missing.join(",")}`,
	);
	assert(
		missing.unexpected.length === 0,
		"self-test: missing fixture must not also be unexpected",
	);
	const missingReport = formatReport(missing);
	assert(
		missingReport.includes(
			"FAIL missing package(s) (required by the closed SF3 list plus merge targets):",
		) && missingReport.includes(`  ${MERGE_TARGET_INTEROP}`),
		`self-test: missing report, got ${missingReport}`,
	);

	const emptyParse = parseSurfaceSpec("");
	assert(
		emptyParse.targets.length === 0 &&
			emptyParse.sf1Satellites.length === 0,
		"self-test: empty spec must yield empty parses",
	);

	return {
		unexpectedReport,
		missingReport,
		emptyClosedError: EMPTY_CLOSED,
		emptyLiveError: EMPTY_LIVE,
	};
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let specPath = null;
	let selfTestOnly = false;
	let closedNoMergePath = null;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--self-test") {
			selfTestOnly = true;
			continue;
		}
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--spec") {
			specPath = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--closed-no-merge") {
			closedNoMergePath = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, specPath, selfTestOnly, closedNoMergePath };
}

function loadClosedNoMergeFile(filePath) {
	const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
	if (!Array.isArray(raw)) {
		throw new Error(
			"--closed-no-merge must be a JSON array of package names",
		);
	}
	return raw;
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.selfTestOnly) {
		const printed = runSelfTests(DEFAULT_REPO_ROOT);
		console.log("self-test unexpected fixture:");
		console.log(printed.unexpectedReport);
		console.log("");
		console.log("self-test missing fixture:");
		console.log(printed.missingReport);
		console.log("");
		console.log("self-test empty closed list:");
		console.log(printed.emptyClosedError);
		console.log("");
		console.log("self-test empty live walk:");
		console.log(printed.emptyLiveError);
		console.log("");

		const fixtureRoot = path.join(
			DEFAULT_REPO_ROOT,
			"scripts",
			"__fixtures__",
			"sf3-package-list-check",
		);
		const unexpectedDir = path.join(fixtureRoot, "unexpected");
		const missingDir = path.join(fixtureRoot, "missing");
		const emptyClosedDir = path.join(fixtureRoot, "empty-closed");
		const emptyLiveDir = path.join(fixtureRoot, "empty-live");

		const unexpectedRun = await runCheck({
			repoRoot: unexpectedDir,
			closedNoMerge: loadClosedNoMergeFile(
				path.join(unexpectedDir, "closed-no-merge.json"),
			),
			mergeTargets: [MERGE_TARGET_AI, MERGE_TARGET_INTEROP],
		});
		assert(
			!unexpectedRun.ok,
			"self-test: unexpected fixture tree must fail",
		);
		assert(
			unexpectedRun.unexpected.includes("@input/pen-sf3-unexpected"),
			`self-test: fixture tree unexpected, got ${unexpectedRun.unexpected.join(",")}`,
		);

		const missingRun = await runCheck({
			repoRoot: missingDir,
			closedNoMerge: loadClosedNoMergeFile(
				path.join(missingDir, "closed-no-merge.json"),
			),
			mergeTargets: [MERGE_TARGET_AI, MERGE_TARGET_INTEROP],
		});
		assert(!missingRun.ok, "self-test: missing fixture tree must fail");
		assert(
			missingRun.missing.includes(MERGE_TARGET_INTEROP),
			`self-test: fixture tree missing, got ${missingRun.missing.join(",")}`,
		);

		const emptyClosedRun = await runCheck({
			repoRoot: emptyClosedDir,
			closedNoMerge: loadClosedNoMergeFile(
				path.join(emptyClosedDir, "closed-no-merge.json"),
			),
			mergeTargets: [MERGE_TARGET_AI, MERGE_TARGET_INTEROP],
		});
		assert(
			emptyClosedRun.error === EMPTY_CLOSED,
			`self-test: empty closed file, got ${emptyClosedRun.error}`,
		);

		const emptyLiveRun = await runCheck({
			repoRoot: emptyLiveDir,
			closedNoMerge: ["@input/pen-core"],
			mergeTargets: [MERGE_TARGET_AI, MERGE_TARGET_INTEROP],
		});
		assert(
			emptyLiveRun.error === EMPTY_LIVE,
			`self-test: empty live walk, got ${emptyLiveRun.error}`,
		);

		console.log(
			"SF3 self-test ok (unexpected name, missing name, empty closed list, and empty walk all fail closed)",
		);
		return;
	}

	const closedNoMerge = args.closedNoMergePath
		? loadClosedNoMergeFile(args.closedNoMergePath)
		: CLOSED_NO_MERGE;

	const result = await runCheck({
		repoRoot: args.repoRoot,
		specPath: args.specPath,
		closedNoMerge,
	});

	if (result.error) {
		console.error(result.report);
		process.exitCode = 1;
		return;
	}

	console.log(
		`population: ${result.live.length} workspace packages (packages/**/package.json, private included)`,
	);
	console.log("");
	console.log(result.report);
	if (!result.ok) {
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
