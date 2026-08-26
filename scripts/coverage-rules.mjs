#!/usr/bin/env node
/**
 * coverage:rules
 *
 * Greps the spec roots for rule-ID tokens and greps tests for claims.
 *
 * Every family is derived from definition lines: DEFINITION_LINE_RE
 * walks the markdown and PROCESS_PREFIXES is the only documented
 * exclusion. There is no hand-maintained inventory list, because a
 * family that exists only in a hand-maintained list can be forgotten,
 * and that is the silent-filter defect this gate hit twice under the
 * previous inventory-line model.
 *
 * A missing root is skipped, so a root can be retired without editing
 * this script. Zero collected IDs across all roots is empty inventory
 * and fails. A prefix defined as a rule in more than one root is
 * printed as COLLISION: a test named for the shared token claims the
 * rule in every root that defines it.
 *
 * Claimed-scope IDs without a claiming test name fail.
 * Gated-scope IDs without a verified, wired gate fail.
 * Unlisted spec IDs are reported, not failed.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
// `spec` is the current-state tree and the home of every durable
// normative rule (spec/rules/*.md, plus package docs that carry their
// own families). `spec-v5` is the executing train. Adopting or
// retiring a train is a one-line edit here; a listed root that does
// not exist on disk is skipped rather than failing.
const SPEC_ROOTS = ["spec", "spec-v5"];
const DEFAULT_CLAIMED_SCOPE = path.join("scripts", "claimed-scope.txt");
const DEFAULT_GATED_SCOPE = path.join("scripts", "gated-scope.txt");
const WORKFLOW_DIR = ".github/workflows/";
const GATED_ROW_RE =
	/^([A-Z]+\d+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(.+)$/;

// Spec IDs with these prefixes fail if no test name claims them,
// even when claimed-scope.txt has not listed them yet. Fail now,
// pass when the claiming tests land. Every other family defaults to
// reported-not-failed so an in-flight train cannot block the gate.
// Put a family here only when it is already claimed and must stay
// that way — not to hide an unimplemented set.
const IN_FORCE_PREFIXES = ["OB", "PR"];
// Working agreements are process, not product invariants. They are
// excluded from derivation so they are not mistaken for unclaimed
// test-name obligations. This list is the documented exclusion;
// dropping a prefix from derivation without naming it here would be
// the silent-filter defect.
const PROCESS_PREFIXES = ["WA"];
const EMPTY_INVENTORY = "empty inventory";
const DEFINITION_LINE_RE = /^[-*]\s+([A-Z]+)\d+\s*[.—–]/;
const COLLISION_LINE =
	"defined as rules in more than one spec root; a test named for the shared token claims each";

export function parseRuleId(id) {
	// Greedy [A-Z]+ is the letter-run extract. OPB1 → OPB, not OP.
	// Do not replace with startsWith(prefix): OP is a prefix of OPB,
	// O of OP, I of INT, A of AN. That is containment, not the D-vs-D
	// same-token collision printed as COLLISION.
	const match = id.match(/^([A-Z]+)(\d+)$/);
	if (match == null) {
		return null;
	}
	return { prefix: match[1], n: Number(match[2]) };
}

export function sortPrefixesLongestFirst(prefixes) {
	// Longest first so OPB is tried before OP in an alternation.
	// Length alone is not the fence — see ruleIdRegex.
	return [...prefixes].sort(
		(a, b) => b.length - a.length || a.localeCompare(b),
	);
}

const TEST_FILE_RE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".git",
	".turbo",
]);
const TEST_NAME_RE =
	/\b(?:describe|it|test|scenario)(?:\.(?:skip|only|todo))*\s*\(\s*(['"`])((?:\\.|[^\\])*?)\1/g;

export function derivedPrefixes(
	definedByRoot,
	processPrefixes = PROCESS_PREFIXES,
) {
	const excluded = new Set(processPrefixes);
	const derived = new Set();
	for (const prefixes of definedByRoot.values()) {
		for (const prefix of prefixes) {
			derived.add(prefix);
		}
	}
	return sortPrefixesLongestFirst(
		[...derived].filter((prefix) => !excluded.has(prefix)),
	);
}

export function prefixesDefinedInMarkdown(text) {
	const prefixes = new Set();
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(DEFINITION_LINE_RE);
		if (match != null) {
			prefixes.add(match[1]);
		}
	}
	return prefixes;
}

export function collidingPrefixes(byRoot) {
	const rootCount = new Map();
	for (const prefixes of byRoot.values()) {
		for (const prefix of prefixes) {
			rootCount.set(prefix, (rootCount.get(prefix) ?? 0) + 1);
		}
	}
	return [...rootCount.entries()]
		.filter(([, count]) => count > 1)
		.map(([prefix]) => prefix)
		.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function inForceIds(specIds, prefixes = IN_FORCE_PREFIXES) {
	const set = new Set(prefixes);
	return [...specIds]
		.filter((id) => {
			const parsed = parseRuleId(id);
			return parsed != null && set.has(parsed.prefix);
		})
		.sort(compareIds);
}

export function mergeClaimedIds(claimedIds, specIds) {
	const seen = new Set(claimedIds);
	const merged = [...claimedIds];
	for (const id of inForceIds(specIds)) {
		if (!seen.has(id)) {
			seen.add(id);
			merged.push(id);
		}
	}
	return merged;
}

export function ruleIdRegex(prefixes) {
	const alternation = sortPrefixesLongestFirst(prefixes)
		.map(escapeRegExp)
		.join("|");
	// (?![A-Z]) is the containment fence. OP is a prefix of OPB;
	// `\bOP` would otherwise start-match OPB1. `\d+` after the prefix
	// already stops that for this regex (B is not a digit); the
	// lookahead makes the rule visible so nobody "simplifies" it
	// back to a prefix or substring search. Same-token collision
	// (v2 D1 vs v3 D1) is a different hazard — see COLLISION_LINE.
	return new RegExp(`\\b(?:${alternation})(?![A-Z])\\d+\\b`, "g");
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function collectIds(text, idRegex, isRuleId = () => true) {
	const ids = new Set();
	idRegex.lastIndex = 0;
	for (const match of text.matchAll(idRegex)) {
		if (isRuleId(match[0])) {
			ids.add(match[0]);
		}
	}
	return ids;
}

export function ruleIdPredicate(prefixes) {
	// Membership only. Upper bounds used to come from a hand-written
	// inventory line, which meant a rule appended to a family was
	// invisible until someone remembered to widen the range. Families
	// now grow by writing a definition line, so the definition is the
	// bound and there is nothing to keep in sync.
	const known = new Set(prefixes);
	return (id) => {
		const parsed = parseRuleId(id);
		return parsed != null && known.has(parsed.prefix) && parsed.n >= 1;
	};
}

export function parseClaimedScope(text) {
	const ids = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*$/, "").trim();
		if (line.length === 0) {
			continue;
		}
		ids.push(line);
	}
	return ids;
}

export function parseGatedScope(text) {
	const rows = [];
	const seen = new Set();
	for (const rawLine of text.split(/\r?\n/)) {
		const hash = rawLine.indexOf("#");
		const line = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
		if (line.length === 0) {
			continue;
		}
		const match = line.match(GATED_ROW_RE);
		if (match == null) {
			throw new Error(
				`gated-scope: expected "ID | gate | workflow | invoke | fingerprint", got: ${rawLine.trim()}`,
			);
		}
		const id = match[1];
		if (seen.has(id)) {
			throw new Error(`gated-scope: duplicate id ${id}`);
		}
		seen.add(id);
		rows.push({
			id,
			gate: match[2],
			workflow: match[3],
			invoke: match[4],
			fingerprint: match[5].trim(),
		});
	}
	return rows;
}

function hasPathTraversal(posixPath) {
	return posixPath.split("/").includes("..") || path.isAbsolute(posixPath);
}

export function isWorkflowPath(posixPath) {
	if (!posixPath.startsWith(WORKFLOW_DIR) || !posixPath.endsWith(".yml")) {
		return false;
	}
	const name = posixPath.slice(WORKFLOW_DIR.length);
	return name.length > 0 && !name.includes("/");
}

export function commandLines(yaml) {
	const lines = [];
	for (const rawLine of yaml.split(/\r?\n/)) {
		const trimmed = rawLine.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) {
			continue;
		}
		const match = trimmed.match(/^(?:-\s+)?(?:run|command):\s*(.+)$/);
		if (match == null) {
			continue;
		}
		const command = match[1].replace(/\s+#.*$/, "").trim();
		if (command.length > 0) {
			lines.push(command);
		}
	}
	return lines;
}

export function workflowInvokes(yaml, invoke) {
	return commandLines(yaml).some((command) => command.includes(invoke));
}

export async function verifyGatedRow(repoRoot, row) {
	const errors = [];
	if (hasPathTraversal(row.gate) || hasPathTraversal(row.workflow)) {
		errors.push("gated-scope path may not contain '..' or be absolute");
		return errors;
	}
	if (!isWorkflowPath(row.workflow)) {
		errors.push(`workflow must be a ${WORKFLOW_DIR}*.yml file`);
		return errors;
	}

	const gatePath = path.join(repoRoot, ...row.gate.split("/"));
	const workflowPath = path.join(repoRoot, ...row.workflow.split("/"));

	let gateText;
	try {
		gateText = await fs.readFile(gatePath, "utf8");
	} catch {
		errors.push(`gated-but-missing (${row.gate} does not exist)`);
	}
	if (gateText != null && !gateText.includes(row.fingerprint)) {
		errors.push(
			`gated-but-unverified (gate is missing fingerprint "${row.fingerprint}")`,
		);
	}

	let workflowText;
	try {
		workflowText = await fs.readFile(workflowPath, "utf8");
	} catch {
		errors.push(`gated-but-unwired (${row.workflow} does not exist)`);
	}
	if (workflowText != null && !workflowInvokes(workflowText, row.invoke)) {
		errors.push(
			`gated-but-unwired (${row.workflow} has no uncommented run:/command: containing "${row.invoke}")`,
		);
	}
	return errors;
}

export function extractTestNames(source) {
	const names = [];
	TEST_NAME_RE.lastIndex = 0;
	for (const match of source.matchAll(TEST_NAME_RE)) {
		names.push(match[2].replace(/\\(['"`])/g, "$1"));
	}
	return names;
}

function testNamesClaimId(names, id) {
	// Full token, not a prefix. `\bOP1\b` does not match OPB1;
	// `\bOPB1\b` does not match OP1. startsWith / includes would.
	const token = new RegExp(`\\b${escapeRegExp(id)}\\b`);
	return names.some((name) => token.test(name));
}

async function walkFiles(rootDir, predicate) {
	const out = [];
	async function visit(dir) {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (SKIP_DIR_NAMES.has(entry.name)) {
				continue;
			}
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await visit(full);
				continue;
			}
			if (entry.isFile() && predicate(full)) {
				out.push(full);
			}
		}
	}
	await visit(rootDir);
	return out;
}

function toPosix(repoRoot, filePath) {
	return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

export async function collectSpecIds(repoRoot, idRegex, isRuleId) {
	const files = [];
	for (const specDir of SPEC_ROOTS) {
		files.push(
			...(await walkFiles(path.join(repoRoot, specDir), (filePath) =>
				filePath.endsWith(".md"),
			)),
		);
	}
	const ids = new Set();
	const locations = new Map();
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		for (const id of collectIds(text, idRegex, isRuleId)) {
			ids.add(id);
			if (!locations.has(id)) {
				locations.set(id, toPosix(repoRoot, filePath));
			}
		}
	}
	return { ids, locations, fileCount: files.length };
}

export async function collectDefinedPrefixes(repoRoot) {
	const byRoot = new Map();
	for (const specDir of SPEC_ROOTS) {
		const prefixes = new Set();
		const files = await walkFiles(
			path.join(repoRoot, specDir),
			(filePath) => filePath.endsWith(".md"),
		);
		for (const filePath of files) {
			const text = await fs.readFile(filePath, "utf8");
			for (const prefix of prefixesDefinedInMarkdown(text)) {
				prefixes.add(prefix);
			}
		}
		byRoot.set(specDir, prefixes);
	}
	return byRoot;
}

export function assertNonEmptyInventory(ids) {
	if (ids.size === 0) {
		throw new Error(
			`${EMPTY_INVENTORY}: no rule IDs found under ${SPEC_ROOTS.join(" or ")}`,
		);
	}
}

export function assertPrefixesDerived(prefixes) {
	// Derivation replaced a hand-written inventory, so the failure mode
	// moved: the gate can no longer be wrong about bounds, but it can
	// silently inventory nothing if the roots stop containing
	// definition lines. Fail loudly instead of reporting a clean sweep.
	if (prefixes.length === 0) {
		throw new Error(
			`${EMPTY_INVENTORY}: no rule families defined under ${SPEC_ROOTS.join(" or ")}; expected definition lines matching ${DEFINITION_LINE_RE}`,
		);
	}
}

export async function collectTestClaims(
	repoRoot,
	claimedIds,
	idRegex,
	isRuleId,
) {
	const searchRoots = ["packages", "playground", "internal", "scripts"].map((dir) =>
		path.join(repoRoot, dir),
	);
	const files = [];
	for (const root of searchRoots) {
		files.push(
			...(await walkFiles(root, (filePath) =>
				TEST_FILE_RE.test(filePath),
			)),
		);
	}

	const claims = new Map();
	const claimedSet = new Set(claimedIds);

	for (const filePath of files) {
		const source = await fs.readFile(filePath, "utf8");
		const names = extractTestNames(source);
		const relative = toPosix(repoRoot, filePath);
		const idsInFile = new Set();
		for (const name of names) {
			for (const id of collectIds(name, idRegex, isRuleId)) {
				idsInFile.add(id);
			}
		}
		for (const id of claimedSet) {
			if (!idsInFile.has(id) && testNamesClaimId(names, id)) {
				idsInFile.add(id);
			}
		}
		for (const id of idsInFile) {
			if (!claims.has(id)) {
				claims.set(id, []);
			}
			claims.get(id).push(relative);
		}
	}
	return { claims, fileCount: files.length };
}

export function evaluateCoverage({
	specIds,
	claimedIds,
	claims,
	gatedRows = [],
	gateChecks = [],
}) {
	const claimedUnclaimed = [];
	const claimedOk = [];
	for (const id of claimedIds) {
		const files = claims.get(id) ?? [];
		if (files.length === 0) {
			claimedUnclaimed.push(id);
		} else {
			claimedOk.push({ id, files });
		}
	}

	const gatedOk = [];
	const gatedFailed = [];
	for (let i = 0; i < gatedRows.length; i += 1) {
		const row = gatedRows[i];
		const errors = gateChecks[i] ?? [];
		if (errors.length === 0) {
			gatedOk.push(row);
		} else {
			gatedFailed.push({ ...row, errors });
		}
	}

	const covered = new Set([...claimedIds, ...gatedRows.map((row) => row.id)]);
	const unlisted = [...specIds]
		.filter((id) => !covered.has(id))
		.sort(compareIds);
	return { claimedOk, claimedUnclaimed, gatedOk, gatedFailed, unlisted };
}

function compareIds(a, b) {
	const parsedA = parseRuleId(a);
	const parsedB = parseRuleId(b);
	const [ap, an] = parsedA == null ? [a, 0] : [parsedA.prefix, parsedA.n];
	const [bp, bn] = parsedB == null ? [b, 0] : [parsedB.prefix, parsedB.n];
	return ap.localeCompare(bp) || an - bn;
}

function formatReport({
	claimedIds,
	claimedOk,
	claimedUnclaimed,
	gatedRows = [],
	gatedOk = [],
	gatedFailed = [],
	unlisted,
	claims,
	specFileCount,
	testFileCount,
	collisions = [],
	prefixes = [],
}) {
	const lines = [
		"coverage:rules",
		"",
		specFileCount != null
			? `population: ${specFileCount} spec files (${SPEC_ROOTS.join(" + ")}), ${testFileCount} test files`
			: null,
		collisions.length > 0
			? `COLLISION  ${collisions.join(", ")}  ${COLLISION_LINE}`
			: null,
		`Derived families (${prefixes.length}): ${[...prefixes].sort((a, b) => a.localeCompare(b)).join(", ") || "(none)"}`,
		`Process excluded: ${PROCESS_PREFIXES.join(", ")} (working agreements, not test-name rules)`,
		`Claimed scope (${claimedIds.length}): ${claimedIds.join(", ")}`,
		`Gated scope (${gatedRows.length}): ${gatedRows.map((row) => row.id).join(", ") || "(none)"}`,
		"",
	].filter((line) => line != null);

	for (const { id, files } of claimedOk) {
		lines.push(`OK    ${id}  ${files[0]}`);
	}
	for (const row of gatedOk) {
		lines.push(`GATE  ${row.id}  ${row.gate}  via ${row.workflow}`);
	}
	for (const id of claimedUnclaimed) {
		lines.push(
			`FAIL  ${id}  implemented-but-unclaimed (no test name contains this ID)`,
		);
	}
	for (const row of gatedFailed) {
		lines.push(`FAIL  ${row.id}  ${row.errors.join("; ")}`);
	}

	lines.push("");
	lines.push(`Unlisted spec IDs (${unlisted.length}), reported not failed:`);
	if (unlisted.length === 0) {
		lines.push("  (none)");
	} else {
		const chunks = [];
		for (let i = 0; i < unlisted.length; i += 12) {
			chunks.push(unlisted.slice(i, i + 12).join(" "));
		}
		for (const chunk of chunks) {
			lines.push(`  ${chunk}`);
		}
	}

	if (claimedUnclaimed.length > 0) {
		lines.push("");
		lines.push(`${claimedUnclaimed.length} claimed-scope ID(s) unclaimed.`);
	}
	if (gatedFailed.length > 0) {
		lines.push("");
		lines.push(`${gatedFailed.length} gated-scope ID(s) unverified.`);
	}

	const gatedIds = new Set(gatedRows.map((row) => row.id));
	const extraClaims = [...claims.keys()]
		.filter((id) => !claimedIds.includes(id) && !gatedIds.has(id))
		.sort(compareIds);
	if (extraClaims.length > 0) {
		lines.push("");
		lines.push(
			`Claims outside claimed-scope (informational): ${extraClaims.join(", ")}`,
		);
	}

	return lines.join("\n");
}

function parseArgs(argv) {
	const args = {
		selfTest: false,
		claimedScope: DEFAULT_CLAIMED_SCOPE,
		gatedScope: DEFAULT_GATED_SCOPE,
		repoRoot: DEFAULT_REPO_ROOT,
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--self-test") {
			args.selfTest = true;
		} else if (arg === "--claimed-scope") {
			i += 1;
			args.claimedScope = argv[i];
		} else if (arg === "--gated-scope") {
			i += 1;
			args.gatedScope = argv[i];
		} else if (arg === "--repo-root") {
			i += 1;
			args.repoRoot = path.resolve(argv[i]);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return args;
}

function resolveRepoPath(repoRoot, rel) {
	return path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
}

async function runCoverage(
	repoRoot,
	claimedScopeRel,
	gatedScopeRel = DEFAULT_GATED_SCOPE,
) {
	const definedByRoot = await collectDefinedPrefixes(repoRoot);
	const prefixes = derivedPrefixes(definedByRoot);
	assertPrefixesDerived(prefixes);
	const idRegex = ruleIdRegex(prefixes);
	const isRuleId = ruleIdPredicate(prefixes);

	const listedClaimedIds = parseClaimedScope(
		await fs.readFile(resolveRepoPath(repoRoot, claimedScopeRel), "utf8"),
	);
	const gatedRows = parseGatedScope(
		await fs.readFile(resolveRepoPath(repoRoot, gatedScopeRel), "utf8"),
	);
	const gateChecks = [];
	for (const row of gatedRows) {
		gateChecks.push(await verifyGatedRow(repoRoot, row));
	}
	const { ids: specIds, fileCount: specFileCount } = await collectSpecIds(
		repoRoot,
		idRegex,
		isRuleId,
	);
	if (specFileCount === 0) {
		throw new Error(
			`coverage-rules: cannot check: markdown walk over ${SPEC_ROOTS.join(" + ")} matched 0 files`,
		);
	}
	assertNonEmptyInventory(specIds);
	const claimedIds = mergeClaimedIds(listedClaimedIds, specIds);
	const collisions = collidingPrefixes(definedByRoot);
	const { claims, fileCount: testFileCount } = await collectTestClaims(
		repoRoot,
		claimedIds,
		idRegex,
		isRuleId,
	);
	if (testFileCount === 0) {
		throw new Error(
			"coverage-rules: cannot check: packages+playground+internal+scripts test walk matched 0 files",
		);
	}
	const result = evaluateCoverage({
		specIds,
		claimedIds,
		claims,
		gatedRows,
		gateChecks,
	});
	return {
		...result,
		claimedIds,
		claims,
		gatedRows,
		specFileCount,
		testFileCount,
		collisions,
		prefixes,
	};
}

async function makeTree(label, files) {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), `pen-coverage-rules-${label}-`),
	);
	await writeFiles(root, files);
	return root;
}

async function writeFiles(root, files) {
	for (const [relative, contents] of Object.entries(files)) {
		const full = path.join(root, ...relative.split("/"));
		await fs.mkdir(path.dirname(full), { recursive: true });
		await fs.writeFile(full, contents);
	}
}

function namedTest(name) {
	return `import { describe, it } from "vitest";\ndescribe("fixture", () => {\n  it(${JSON.stringify(name)}, () => {});\n});\n`;
}

const TEST_PATH = "packages/core/src/__tests__/fixture.test.ts";
const SECOND_TEST_PATH = "packages/core/src/__tests__/second.test.ts";

function cover(root) {
	return runCoverage(root, "claimed-scope.txt", "gated-scope.txt");
}

function expect(condition, message) {
	if (!condition) {
		throw new Error(`self-test: ${message}`);
	}
}

async function selfTestClaimsAndReports() {
	const root = await makeTree("claims", {
		"spec/rules/fixture.md":
			"- I2. Mapping stays in range.\n- HOST5. Fixture-only unlisted ID.\n",
		"claimed-scope.txt": "I2\n",
		"gated-scope.txt": "",
		[TEST_PATH]: namedTest("does not mention a rule"),
	});

	const failing = await cover(root);
	expect(
		failing.claimedUnclaimed.join() === "I2",
		`expected I2 unclaimed, got ${failing.claimedUnclaimed.join(",")}`,
	);
	expect(
		failing.unlisted.includes("HOST5"),
		`expected HOST5 reported, got ${failing.unlisted.join(",")}`,
	);

	await writeFiles(root, {
		[SECOND_TEST_PATH]: namedTest(
			"I2 maps every pre-commit point into range or null",
		),
	});
	const passing = await cover(root);
	expect(
		passing.claimedUnclaimed.length === 0,
		"expected I2 claimed after fixture test, still unclaimed",
	);
	expect(
		passing.unlisted.includes("HOST5"),
		"HOST5 must stay reported-not-failed",
	);

	await fs.rm(root, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (fixture spec fails closed, then claims I2)",
	);
}

async function selfTestGatedScope() {
	let bareThrew = false;
	try {
		parseGatedScope("I4\n");
	} catch (error) {
		bareThrew = String(error.message).includes("gated-scope");
	}
	expect(bareThrew, "a bare gated-scope ID must be a parse error");

	const root = await makeTree("gated", {
		"spec/rules/fixture.md":
			"- I2. Mapping stays in range.\n- HOST5. Fixture-only unlisted ID.\n- I4. Gate-covered fixture.\n",
		"claimed-scope.txt": "I2\n",
		"gated-scope.txt":
			"I4 | scripts/col-gate.mjs | .github/workflows/docs.yml | col-gate.mjs | data-col5\n",
		[TEST_PATH]: namedTest(
			"I2 maps every pre-commit point into range or null",
		),
		"scripts/col-gate.mjs": "// data-col5\nexport {}\n",
		".github/workflows/docs.yml":
			"jobs:\n  build:\n    steps:\n      - run: node scripts/col-gate.mjs\n",
	});
	const gatePath = path.join(root, "scripts", "col-gate.mjs");
	const workflowPath = path.join(root, ".github", "workflows", "docs.yml");

	const gated = await cover(root);
	expect(
		gated.gatedOk.map((row) => row.id).join() === "I4",
		`expected I4 gated, got ok=${gated.gatedOk.map((row) => row.id)} fail=${JSON.stringify(gated.gatedFailed)}`,
	);
	expect(
		!gated.unlisted.includes("I4"),
		"I4 must leave the unlisted report once gated",
	);
	expect(
		gated.unlisted.includes("HOST5"),
		"HOST5 must stay reported-not-failed next to a GATE row",
	);

	await fs.rm(gatePath);
	const missing = await cover(root);
	expect(
		missing.gatedFailed.map((row) => row.id).join() === "I4",
		"deleting the gate file must FAIL I4",
	);
	expect(
		missing.gatedFailed[0].errors.some((error) =>
			error.includes("gated-but-missing"),
		),
		`missing gate must say gated-but-missing, got ${missing.gatedFailed[0].errors}`,
	);

	await fs.writeFile(gatePath, "// data-col5\nexport {}\n");
	await fs.writeFile(workflowPath, "# run: node scripts/col-gate.mjs\n");
	const unwired = await cover(root);
	expect(
		unwired.gatedFailed.map((row) => row.id).join() === "I4",
		"commenting out the workflow run must FAIL I4",
	);
	expect(
		unwired.gatedFailed[0].errors.some((error) =>
			error.includes("gated-but-unwired"),
		),
		`unwired gate must say gated-but-unwired, got ${unwired.gatedFailed[0].errors}`,
	);

	await fs.rm(root, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (gated I4 fails closed when the gate is deleted or unwired)",
	);
}

async function selfTestSecondRootIsOptional() {
	const root = await makeTree("roots", {
		"spec/rules/fixture.md": "- I2. Mapping stays in range.\n",
		"spec-v5/01-anchors.md":
			"- AN1. Resolution is total.\n- AS2. Repair then resolve.\n",
		"claimed-scope.txt": "I2\n",
		"gated-scope.txt": "",
		[TEST_PATH]: namedTest(
			"I2 maps every pre-commit point into range or null",
		),
	});

	const withTrain = await cover(root);
	expect(
		withTrain.unlisted.includes("AN1") && withTrain.unlisted.includes("AS2"),
		`train families AN/AS must be inventoried, got ${withTrain.unlisted.join(",")}`,
	);
	expect(
		!withTrain.collisions.includes("D"),
		"collision must stay silent when only one root defines a family",
	);

	await fs.rm(path.join(root, "spec-v5"), { recursive: true, force: true });
	const withoutTrain = await cover(root);
	expect(
		withoutTrain.claimedUnclaimed.length === 0,
		"an absent train root must not break the current-state inventory",
	);
	expect(
		!withoutTrain.unlisted.includes("AN1"),
		"an absent train root must not invent AN/AS IDs",
	);

	const emptyIds = await collectSpecIds(root, ruleIdRegex(["NOPE"]), () => false);
	expect(
		emptyIds.ids.size === 0,
		`rejecting predicate must yield zero IDs, got ${[...emptyIds.ids]}`,
	);
	let emptyThrew = false;
	try {
		assertNonEmptyInventory(emptyIds.ids);
	} catch (error) {
		emptyThrew = String(error.message).includes(EMPTY_INVENTORY);
	}
	expect(
		emptyThrew,
		"an inventory that finds zero rule IDs must fail empty inventory",
	);

	let noFamiliesThrew = false;
	try {
		assertPrefixesDerived([]);
	} catch (error) {
		noFamiliesThrew = String(error.message).includes(EMPTY_INVENTORY);
	}
	expect(
		noFamiliesThrew,
		"roots with no definition lines must fail empty inventory, not report a clean sweep",
	);

	await fs.rm(root, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (train families inventoried; absent train root is skipped; empty inventory fails)",
	);
}

async function selfTestInForceFamily() {
	const root = await makeTree("inforce", {
		"spec/rules/fixture.md": "- I2. Mapping stays in range.\n",
		"spec-v5/02-observation.md": "- OB2. One builder, one code path.\n",
		"claimed-scope.txt": "I2\n",
		"gated-scope.txt": "",
		[TEST_PATH]: namedTest(
			"I2 maps every pre-commit point into range or null",
		),
	});

	const unclaimed = await cover(root);
	expect(
		unclaimed.claimedUnclaimed.includes("OB2"),
		`in-force OB2 must be unclaimed, got ${unclaimed.claimedUnclaimed.join(",")}`,
	);

	await writeFiles(root, {
		[SECOND_TEST_PATH]: namedTest("OB2 keeps one builder path"),
	});
	const claimed = await cover(root);
	expect(
		!claimed.claimedUnclaimed.includes("OB2"),
		"OB2 must leave claimedUnclaimed once named",
	);

	await fs.rm(root, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (in-force OB2 fails closed without a claiming test, then claims)",
	);
}

async function selfTestCollision() {
	const root = await makeTree("collision", {
		"spec/rules/commands.md": "- D1. Handlers run in facet order.\n",
		"spec-v5/00-concept.md":
			"- D1 — The mapping algebra duplicates CRDT position identity.\n",
		"claimed-scope.txt": "D1\n",
		"gated-scope.txt": "",
		[TEST_PATH]: namedTest("D1 tries handlers in facet order"),
	});

	const both = await cover(root);
	expect(
		both.collisions.includes("D"),
		`collision must fire when both roots define D, got ${both.collisions.join(",")}`,
	);
	const bothReport = formatReport(both);
	expect(
		bothReport.includes(`COLLISION  D  ${COLLISION_LINE}`),
		`collision must print COLLISION D, got ${bothReport.split("\n").slice(0, 8).join(" | ")}`,
	);

	await writeFiles(root, {
		"spec-v5/00-concept.md": "- OB1. Effect plus the two repair recipes.\n",
	});
	const single = await cover(root);
	expect(
		!single.collisions.includes("D"),
		"collision must stay silent when only one root defines D",
	);
	expect(
		!formatReport(single).includes("COLLISION  D  "),
		"a silent collision must omit the COLLISION D line",
	);

	await fs.rm(root, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (collision fires when both roots define D; silent when only one does)",
	);
}

async function selfTestInventedFamilyIsDerived() {
	const root = await makeTree("invented", {
		"spec/rules/fixture.md": "- I2. Mapping stays in range.\n",
		"spec-v5/scratch-zz.md":
			"- ZZ1. Invented family must be seen without a hand list.\n",
		"claimed-scope.txt": "I2\n",
		"gated-scope.txt": "",
		[TEST_PATH]: namedTest(
			"I2 maps every pre-commit point into range or null",
		),
	});

	const invented = await cover(root);
	expect(
		invented.prefixes.includes("ZZ"),
		`invented ZZ must be derived, got ${invented.prefixes.join(",")}`,
	);
	expect(
		invented.unlisted.includes("ZZ1"),
		`invented ZZ1 must be reported-not-failed, got ${invented.unlisted.join(",")}`,
	);
	expect(
		!invented.claimedUnclaimed.includes("ZZ1"),
		"invented ZZ1 must not fail the gate; it is unlisted, not in-force",
	);
	const inventedLine = formatReport(invented)
		.split("\n")
		.find((line) => /\bZZ1\b/.test(line));
	expect(inventedLine != null, "invented ZZ1 must appear in the report");
	console.log(`coverage:rules invented-family proof: ${inventedLine}`);

	await fs.rm(root, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (invented family ZZ is derived and reported, not failed)",
	);
}

async function selfTestContainmentFence() {
	const root = await makeTree("containment", {
		"spec/rules/fixture.md": "- I2. Mapping stays in range.\n",
		"spec-v5/03-ops.md": "- OP1. Closed union.\n- OPB1. Validate phase.\n",
		"claimed-scope.txt": "I2\nOP1\n",
		"gated-scope.txt": "",
		[TEST_PATH]: namedTest(
			"I2 maps every pre-commit point into range or null",
		),
		[SECOND_TEST_PATH]: namedTest("OPB1 runs in the validate phase"),
	});

	const contained = await cover(root);
	expect(
		contained.claimedUnclaimed.includes("OP1"),
		`OPB1 must not claim OP1, got unclaimed=${contained.claimedUnclaimed.join(",")}`,
	);
	expect(
		contained.unlisted.includes("OPB1"),
		`OPB1 must stay reported-not-failed, got ${contained.unlisted.join(",")}`,
	);
	expect(
		(contained.claims.get("OP1") ?? []).length === 0,
		"OPB1 must not be recorded as a claim on OP1",
	);
	expect(
		(contained.claims.get("OPB1") ?? []).length > 0,
		"OPB1 must be recorded as its own claim",
	);

	await fs.rm(root, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (OPB1 does not claim OP1; both families stay distinct)",
	);
}

async function runSelfTest() {
	await selfTestClaimsAndReports();
	await selfTestGatedScope();
	await selfTestSecondRootIsOptional();
	await selfTestInForceFamily();
	await selfTestCollision();
	await selfTestInventedFamilyIsDerived();
	await selfTestContainmentFence();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.selfTest) {
		await runSelfTest();
		return;
	}

	const result = await runCoverage(
		args.repoRoot,
		args.claimedScope,
		args.gatedScope,
	);
	console.log(formatReport(result));
	if (result.claimedUnclaimed.length > 0 || result.gatedFailed.length > 0) {
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
