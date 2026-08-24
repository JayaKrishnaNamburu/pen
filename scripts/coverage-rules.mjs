#!/usr/bin/env node
/**
 * coverage:rules (Wave 0.6)
 *
 * Greps spec-v2 and spec-v3 (when present) for rule-ID tokens
 * (inventory prefixes from spec-v2/09-reliability-testing.md "Rule:"
 * line, plus EXTRA_PREFIXES, plus spec-v3 families derived from
 * definition lines) and greps tests for claims. spec-v3 is optional;
 * a missing directory is skipped. Zero collected IDs is empty
 * inventory and fails. Prefixes defined as rules in both spec roots
 * are printed as COLLISION (D is the known case).
 *
 * spec-v3 families are not hand-listed. DEFINITION_LINE_RE walks the
 * files; PROCESS_PREFIXES is the only documented exclusion. Adding a
 * family to EXTRA_PREFIXES instead of deriving it is the silent-filter
 * defect this gate has hit twice.
 *
 * Claimed-scope IDs without a claiming test name fail.
 * Gated-scope IDs without a verified, wired gate fail.
 * Unlisted spec IDs are reported, not failed.
 *
 * Handover: @input/pen-conformance does not exist in this checkout.
 * When packages/tooling/conformance lands, add
 *   "coverage:rules": "node ../../../scripts/coverage-rules.mjs"
 * to that package.json. Do not rebuild the harness here.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const INVENTORY_DOC = path.join("spec-v2", "09-reliability-testing.md");
const SPEC_ROOTS = ["spec-v2", "spec-v3"];
const DEFAULT_CLAIMED_SCOPE = path.join("scripts", "claimed-scope.txt");
const DEFAULT_GATED_SCOPE = path.join("scripts", "gated-scope.txt");
const WORKFLOW_DIR = ".github/workflows/";
const GATED_ROW_RE =
	/^([A-Z]+\d+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(.+)$/;

// spec-v2 families that are real rules but were never added to the
// Rule: inventory line in 09-reliability-testing.md. This is not a
// v3 inclusion list — v3 families are derived from definition lines.
// Do not add a v3 prefix here: a family that exists only here can be
// forgotten, which is the defect derivation replaces. A narrowing
// filter that "looks redundant" next to derivation is how this gate
// went blind to OP/OPB/INT.
const EXTRA_PREFIXES = ["DUR", "COL", "AIB", "IOP", "SCALE"];
// Spec IDs with these prefixes fail if no test name claims them,
// even when claimed-scope.txt has not listed them yet. Fail now,
// pass when the claiming tests land. Derived v3 families default to
// reported-not-failed (the SF posture) so GATE 0.1 cannot block
// later waves. Put a family here only when it is already claimed
// and must stay that way — not to hide an unimplemented set.
const IN_FORCE_PREFIXES = ["OB", "PR"];
// WA1–WA6 are working agreements (process), not product invariants.
// Excluded from the derived v3 set so they are not mistaken for
// unclaimed test-name obligations. This list is the documented
// exclusion; dropping WA from derivation without naming it here
// would be the silent-filter defect. Script-gateable: WA1
// (spec-v3 closed at 00–06 + waves/), WA2 (scripts/v3-gates.mjs;
// wave files must contain no status prose), WA5
// (scripts/wave-deletions-migration-check.mjs). Review-only: WA3
// (mechanism + first consumer in the same wave), WA4 (do not put
// standing gates on the v3 critical path), WA6 (name the native
// capability before borrowing).
const PROCESS_PREFIXES = ["WA"];
const EMPTY_INVENTORY = "empty inventory";
const DEFINITION_LINE_RE = /^[-*]\s+([A-Z]+)\d+\s*[.—–]/;
const COLLISION_LINE =
	"defined as rules in spec-v2 and spec-v3; a test named for either root claims both";

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

export function parseInventoryRanges(markdown) {
	const ruleLine = markdown
		.split(/\r?\n/)
		.find((line) => line.startsWith("Rule:"));
	if (ruleLine == null) {
		throw new Error(`No "Rule:" inventory line in ${INVENTORY_DOC}`);
	}
	const paren = ruleLine.match(/\(([^)]+)\)/);
	if (paren == null) {
		throw new Error(
			`"Rule:" line has no parenthesized inventory in ${INVENTORY_DOC}`,
		);
	}
	return paren[1].split(",").map((part) => parseRangeToken(part.trim()));
}

function parseRangeToken(token) {
	const match = token.match(/^([A-Z]+)(\d+)[–-](?:[A-Z]+)?(\d+)$/);
	if (match == null) {
		throw new Error(`Unparseable inventory range: ${token}`);
	}
	const prefix = match[1];
	const from = Number(match[2]);
	const to = Number(match[3]);
	if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
		throw new Error(`Invalid inventory bounds: ${token}`);
	}
	const ids = [];
	for (let n = from; n <= to; n += 1) {
		ids.push(`${prefix}${n}`);
	}
	return { prefix, from, to, ids };
}

export function prefixesFromRanges(ranges, extraPrefixes = EXTRA_PREFIXES) {
	const prefixes = new Set(extraPrefixes);
	for (const range of ranges) {
		prefixes.add(range.prefix);
	}
	return sortPrefixesLongestFirst(prefixes);
}

export function derivedV3Prefixes(
	definedByRoot,
	processPrefixes = PROCESS_PREFIXES,
) {
	const excluded = new Set(processPrefixes);
	const v3 = definedByRoot.get("spec-v3") ?? new Set();
	return sortPrefixesLongestFirst(
		[...v3].filter((prefix) => !excluded.has(prefix)),
	);
}

export function inventoryPrefixes(
	ranges,
	definedByRoot,
	extraPrefixes = EXTRA_PREFIXES,
) {
	return prefixesFromRanges(ranges, [
		...extraPrefixes,
		...derivedV3Prefixes(definedByRoot),
	]);
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
	const v2 = byRoot.get("spec-v2") ?? new Set();
	const v3 = byRoot.get("spec-v3") ?? new Set();
	return [...v2]
		.filter((prefix) => v3.has(prefix))
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

export function ruleIdPredicate(ranges, extraPrefixes = EXTRA_PREFIXES) {
	const extra = new Set(extraPrefixes);
	return (id) => {
		const parsed = parseRuleId(id);
		if (parsed == null) {
			return false;
		}
		const { prefix, n } = parsed;
		const range = ranges.find((entry) => entry.prefix === prefix);
		if (range != null) {
			// Ranges first: a derived v3 prefix that collides with a
			// v2 inventory token (D) must not widen the v2 bounds.
			// Extras-first would accept D6 once D is derived.
			// API10 is specified in 09-reliability-testing.md after the inventory line.
			const max = prefix === "API" ? Math.max(range.to, 10) : range.to;
			return n >= range.from && n <= max;
		}
		if (extra.has(prefix)) {
			return n >= 1;
		}
		return false;
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

export async function collectTestClaims(
	repoRoot,
	claimedIds,
	idRegex,
	isRuleId,
) {
	const searchRoots = ["packages", "playground", "scripts"].map((dir) =>
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
	derivedPrefixes = [],
}) {
	const lines = [
		"coverage:rules",
		"",
		specFileCount != null
			? `population: ${specFileCount} spec files (spec-v2 + spec-v3), ${testFileCount} test files`
			: null,
		collisions.length > 0
			? `COLLISION  ${collisions.join(", ")}  ${COLLISION_LINE}`
			: null,
		`Derived spec-v3: ${[...derivedPrefixes].sort((a, b) => a.localeCompare(b)).join(", ") || "(none)"}`,
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
	const inventoryText = await fs.readFile(
		path.join(repoRoot, INVENTORY_DOC),
		"utf8",
	);
	const ranges = parseInventoryRanges(inventoryText);
	const definedByRoot = await collectDefinedPrefixes(repoRoot);
	const derivedPrefixes = derivedV3Prefixes(definedByRoot);
	const prefixes = inventoryPrefixes(ranges, definedByRoot);
	const idRegex = ruleIdRegex(prefixes);
	const isRuleId = ruleIdPredicate(ranges, prefixes);

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
			"coverage-rules: cannot check: spec-v2/spec-v3 markdown walk matched 0 files",
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
			"coverage-rules: cannot check: packages+playground+scripts test walk matched 0 files",
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
		derivedPrefixes,
	};
}

async function runSelfTest() {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pen-coverage-rules-"));
	const specDir = path.join(tmp, "spec-v2");
	const testDir = path.join(tmp, "packages", "core", "src", "__tests__");
	await fs.mkdir(specDir, { recursive: true });
	await fs.mkdir(testDir, { recursive: true });

	const inventory = `Rule: every normative rule ID in spec-v2 documents (I1–I12, HOST1–HOST6) must be claimed.\n`;
	await fs.writeFile(
		path.join(specDir, "09-reliability-testing.md"),
		inventory,
	);
	await fs.writeFile(
		path.join(specDir, "fixture-unclaimed.md"),
		"- I2. Mapping stays in range.\n- HOST5. Fixture-only unlisted ID.\n",
	);
	await fs.writeFile(path.join(tmp, "claimed-scope.txt"), "I2\n");
	await fs.writeFile(path.join(tmp, "gated-scope.txt"), "");
	await fs.writeFile(
		path.join(testDir, "empty.test.ts"),
		`import { describe, it } from "vitest";\ndescribe("no claims", () => {\n  it("does not mention a rule", () => {});\n});\n`,
	);

	const failing = await runCoverage(
		tmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (failing.claimedUnclaimed.join() !== "I2") {
		throw new Error(
			`self-test: expected I2 unclaimed, got ${failing.claimedUnclaimed.join(",")}`,
		);
	}
	if (!failing.unlisted.includes("HOST5")) {
		throw new Error(
			`self-test: expected HOST5 reported, got ${failing.unlisted.join(",")}`,
		);
	}

	await fs.writeFile(
		path.join(testDir, "mapping.test.ts"),
		`import { describe, it } from "vitest";\ndescribe("summaries", () => {\n  it("I2 maps every pre-commit point into range or null", () => {});\n});\n`,
	);
	const passing = await runCoverage(
		tmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (passing.claimedUnclaimed.length !== 0) {
		throw new Error(
			`self-test: expected I2 claimed after fixture test, still unclaimed`,
		);
	}
	if (!passing.unlisted.includes("HOST5")) {
		throw new Error(`self-test: HOST5 must stay reported-not-failed`);
	}

	let bareThrew = false;
	try {
		parseGatedScope("I4\n");
	} catch (error) {
		bareThrew = String(error.message).includes("gated-scope");
	}
	if (!bareThrew) {
		throw new Error(
			"self-test: a bare gated-scope ID must be a parse error",
		);
	}

	await fs.appendFile(
		path.join(specDir, "fixture-unclaimed.md"),
		"- I4. Gate-covered fixture.\n",
	);
	const scriptsDir = path.join(tmp, "scripts");
	const workflowDir = path.join(tmp, ".github", "workflows");
	await fs.mkdir(scriptsDir, { recursive: true });
	await fs.mkdir(workflowDir, { recursive: true });
	const gatePath = path.join(scriptsDir, "col-gate.mjs");
	const workflowPath = path.join(workflowDir, "docs.yml");
	await fs.writeFile(gatePath, "// data-col5\nexport {}\n");
	await fs.writeFile(
		workflowPath,
		"jobs:\n  build:\n    steps:\n      - run: node scripts/col-gate.mjs\n",
	);
	await fs.writeFile(
		path.join(tmp, "gated-scope.txt"),
		"I4 | scripts/col-gate.mjs | .github/workflows/docs.yml | col-gate.mjs | data-col5\n",
	);

	const gated = await runCoverage(
		tmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (gated.gatedOk.map((row) => row.id).join() !== "I4") {
		throw new Error(
			`self-test: expected I4 gated, got ok=${gated.gatedOk.map((row) => row.id)} fail=${JSON.stringify(gated.gatedFailed)}`,
		);
	}
	if (gated.unlisted.includes("I4")) {
		throw new Error(
			"self-test: I4 must leave the unlisted report once gated",
		);
	}
	if (!gated.unlisted.includes("HOST5")) {
		throw new Error(
			"self-test: HOST5 must stay reported-not-failed next to a GATE row",
		);
	}

	await fs.rm(gatePath);
	const missing = await runCoverage(
		tmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (missing.gatedFailed.map((row) => row.id).join() !== "I4") {
		throw new Error("self-test: deleting the gate file must FAIL I4");
	}
	if (
		!missing.gatedFailed[0].errors.some((error) =>
			error.includes("gated-but-missing"),
		)
	) {
		throw new Error(
			`self-test: missing gate must say gated-but-missing, got ${missing.gatedFailed[0].errors}`,
		);
	}

	await fs.writeFile(gatePath, "// data-col5\nexport {}\n");
	await fs.writeFile(workflowPath, "# run: node scripts/col-gate.mjs\n");
	const unwired = await runCoverage(
		tmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (unwired.gatedFailed.map((row) => row.id).join() !== "I4") {
		throw new Error(
			"self-test: commenting out the workflow run must FAIL I4",
		);
	}
	if (
		!unwired.gatedFailed[0].errors.some((error) =>
			error.includes("gated-but-unwired"),
		)
	) {
		throw new Error(
			`self-test: unwired gate must say gated-but-unwired, got ${unwired.gatedFailed[0].errors}`,
		);
	}

	await fs.rm(tmp, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (fixture spec fails closed, then claims I2)",
	);
	console.log(
		"coverage:rules self-test ok (gated I4 fails closed when the gate is deleted or unwired)",
	);

	const v3tmp = await fs.mkdtemp(
		path.join(os.tmpdir(), "pen-coverage-rules-v3-"),
	);
	const v3SpecV2 = path.join(v3tmp, "spec-v2");
	const v3SpecV3 = path.join(v3tmp, "spec-v3");
	const v3Tests = path.join(v3tmp, "packages", "core", "src", "__tests__");
	await fs.mkdir(v3SpecV2, { recursive: true });
	await fs.mkdir(v3SpecV3, { recursive: true });
	await fs.mkdir(v3Tests, { recursive: true });
	await fs.writeFile(
		path.join(v3SpecV2, "09-reliability-testing.md"),
		`Rule: every normative rule ID in spec-v2 documents (I1–I12, HOST1–HOST6) must be claimed.\n`,
	);
	await fs.writeFile(
		path.join(v3SpecV2, "fixture-v2.md"),
		"- I2. Mapping stays in range.\n",
	);
	await fs.writeFile(
		path.join(v3SpecV3, "01-anchors.md"),
		"- AN1. Resolution is total.\n- AS2. Repair then resolve.\n",
	);
	await fs.writeFile(path.join(v3tmp, "claimed-scope.txt"), "I2\n");
	await fs.writeFile(path.join(v3tmp, "gated-scope.txt"), "");
	await fs.writeFile(
		path.join(v3Tests, "mapping.test.ts"),
		`import { describe, it } from "vitest";\ndescribe("summaries", () => {\n  it("I2 maps every pre-commit point into range or null", () => {});\n});\n`,
	);

	const withV3 = await runCoverage(
		v3tmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (!withV3.unlisted.includes("AN1") || !withV3.unlisted.includes("AS2")) {
		throw new Error(
			`self-test: spec-v3 AN/AS must be inventoried, got ${withV3.unlisted.join(",")}`,
		);
	}

	await fs.rm(v3SpecV3, { recursive: true, force: true });
	const withoutV3 = await runCoverage(
		v3tmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (withoutV3.claimedUnclaimed.length !== 0) {
		throw new Error(
			"self-test: absent spec-v3 must not break a v2 inventory",
		);
	}
	if (withoutV3.unlisted.includes("AN1")) {
		throw new Error("self-test: absent spec-v3 must not invent AN/AS IDs");
	}

	const emptyIds = await collectSpecIds(
		v3tmp,
		ruleIdRegex(["NOPE"]),
		() => false,
	);
	if (emptyIds.ids.size !== 0) {
		throw new Error(
			`self-test: rejecting predicate must yield zero IDs, got ${[...emptyIds.ids]}`,
		);
	}
	let emptyThrew = false;
	try {
		assertNonEmptyInventory(emptyIds.ids);
	} catch (error) {
		emptyThrew = String(error.message).includes(EMPTY_INVENTORY);
	}
	if (!emptyThrew) {
		throw new Error(
			"self-test: an inventory that finds zero rule IDs must fail empty inventory",
		);
	}

	if (withV3.collisions.includes("D")) {
		throw new Error(
			"self-test: D-collision must stay silent when only one root defines D",
		);
	}

	await fs.rm(v3tmp, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (spec-v3 AN/AS inventoried; absent spec-v3 stays on v2; empty inventory fails)",
	);

	const obtmp = await fs.mkdtemp(
		path.join(os.tmpdir(), "pen-coverage-rules-ob-"),
	);
	const obSpecV2 = path.join(obtmp, "spec-v2");
	const obSpecV3 = path.join(obtmp, "spec-v3");
	const obTests = path.join(obtmp, "packages", "core", "src", "__tests__");
	await fs.mkdir(obSpecV2, { recursive: true });
	await fs.mkdir(obSpecV3, { recursive: true });
	await fs.mkdir(obTests, { recursive: true });
	await fs.writeFile(
		path.join(obSpecV2, "09-reliability-testing.md"),
		`Rule: every normative rule ID in spec-v2 documents (I1–I12, HOST1–HOST6) must be claimed.\n`,
	);
	await fs.writeFile(
		path.join(obSpecV2, "fixture-v2.md"),
		"- I2. Mapping stays in range.\n",
	);
	await fs.writeFile(
		path.join(obSpecV3, "02-observation.md"),
		"- OB2. One builder, one code path.\n",
	);
	await fs.writeFile(path.join(obtmp, "claimed-scope.txt"), "I2\n");
	await fs.writeFile(path.join(obtmp, "gated-scope.txt"), "");
	await fs.writeFile(
		path.join(obTests, "mapping.test.ts"),
		`import { describe, it } from "vitest";\ndescribe("summaries", () => {\n  it("I2 maps every pre-commit point into range or null", () => {});\n});\n`,
	);

	const unclaimedOb = await runCoverage(
		obtmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (!unclaimedOb.claimedUnclaimed.includes("OB2")) {
		throw new Error(
			`self-test: spec-v3 OB2 must be unclaimed, got ${unclaimedOb.claimedUnclaimed.join(",")}`,
		);
	}

	await fs.writeFile(
		path.join(obTests, "observation.test.ts"),
		`import { describe, it } from "vitest";\ndescribe("observation", () => {\n  it("OB2 keeps one builder path", () => {});\n});\n`,
	);
	const claimedOb = await runCoverage(
		obtmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (claimedOb.claimedUnclaimed.includes("OB2")) {
		throw new Error(
			"self-test: OB2 must leave claimedUnclaimed once named",
		);
	}

	await fs.rm(obtmp, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (spec-v3 OB2 fails closed without a claiming test, then claims)",
	);

	const dtmp = await fs.mkdtemp(
		path.join(os.tmpdir(), "pen-coverage-rules-d-"),
	);
	const dSpecV2 = path.join(dtmp, "spec-v2");
	const dSpecV3 = path.join(dtmp, "spec-v3");
	const dTests = path.join(dtmp, "packages", "core", "src", "__tests__");
	await fs.mkdir(dSpecV2, { recursive: true });
	await fs.mkdir(dSpecV3, { recursive: true });
	await fs.mkdir(dTests, { recursive: true });
	await fs.writeFile(
		path.join(dSpecV2, "09-reliability-testing.md"),
		`Rule: every normative rule ID in spec-v2 documents (D1–D5, I1–I12) must be claimed.\n`,
	);
	await fs.writeFile(
		path.join(dSpecV2, "05-commands.md"),
		"- D1. Handlers run in facet order.\n",
	);
	await fs.writeFile(
		path.join(dSpecV3, "00-concept.md"),
		"- D1 — The mapping algebra duplicates CRDT position identity.\n",
	);
	await fs.writeFile(path.join(dtmp, "claimed-scope.txt"), "D1\n");
	await fs.writeFile(path.join(dtmp, "gated-scope.txt"), "");
	await fs.writeFile(
		path.join(dTests, "commands.test.ts"),
		`import { describe, it } from "vitest";\ndescribe("dispatch", () => {\n  it("D1 tries handlers in facet order", () => {});\n});\n`,
	);

	const bothDefineD = await runCoverage(
		dtmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (!bothDefineD.collisions.includes("D")) {
		throw new Error(
			`self-test: D-collision must fire when both roots define D, got ${bothDefineD.collisions.join(",")}`,
		);
	}
	const bothReport = formatReport(bothDefineD);
	if (!bothReport.includes(`COLLISION  D  ${COLLISION_LINE}`)) {
		throw new Error(
			`self-test: D-collision must print COLLISION D, got ${bothReport.split("\n").slice(0, 8).join(" | ")}`,
		);
	}

	await fs.writeFile(
		path.join(dSpecV3, "00-concept.md"),
		"- OB1. Effect plus the two repair recipes.\n",
	);
	const onlyV2DefinesD = await runCoverage(
		dtmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (onlyV2DefinesD.collisions.includes("D")) {
		throw new Error(
			"self-test: D-collision must stay silent when only one root defines D",
		);
	}
	const silentReport = formatReport(onlyV2DefinesD);
	if (silentReport.includes("COLLISION  D  ")) {
		throw new Error(
			"self-test: silent D-collision must omit the COLLISION D line",
		);
	}

	await fs.rm(dtmp, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (D-collision fires when both roots define D; silent when only one does)",
	);

	const zztmp = await fs.mkdtemp(
		path.join(os.tmpdir(), "pen-coverage-rules-zz-"),
	);
	const zzSpecV2 = path.join(zztmp, "spec-v2");
	const zzSpecV3 = path.join(zztmp, "spec-v3");
	const zzTests = path.join(zztmp, "packages", "core", "src", "__tests__");
	await fs.mkdir(zzSpecV2, { recursive: true });
	await fs.mkdir(zzSpecV3, { recursive: true });
	await fs.mkdir(zzTests, { recursive: true });
	await fs.writeFile(
		path.join(zzSpecV2, "09-reliability-testing.md"),
		`Rule: every normative rule ID in spec-v2 documents (I1–I12, HOST1–HOST6) must be claimed.\n`,
	);
	await fs.writeFile(
		path.join(zzSpecV2, "fixture-v2.md"),
		"- I2. Mapping stays in range.\n",
	);
	await fs.writeFile(
		path.join(zzSpecV3, "scratch-zz.md"),
		"- ZZ1. Invented family must be seen without a hand list.\n",
	);
	await fs.writeFile(path.join(zztmp, "claimed-scope.txt"), "I2\n");
	await fs.writeFile(path.join(zztmp, "gated-scope.txt"), "");
	await fs.writeFile(
		path.join(zzTests, "mapping.test.ts"),
		`import { describe, it } from "vitest";\ndescribe("summaries", () => {\n  it("I2 maps every pre-commit point into range or null", () => {});\n});\n`,
	);

	const invented = await runCoverage(
		zztmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (!invented.derivedPrefixes.includes("ZZ")) {
		throw new Error(
			`self-test: invented ZZ must be derived, got ${invented.derivedPrefixes.join(",")}`,
		);
	}
	if (!invented.unlisted.includes("ZZ1")) {
		throw new Error(
			`self-test: invented ZZ1 must be reported-not-failed, got ${invented.unlisted.join(",")}`,
		);
	}
	if (invented.claimedUnclaimed.includes("ZZ1")) {
		throw new Error(
			"self-test: invented ZZ1 must not fail GATE 0.1; it is unlisted, not in-force",
		);
	}
	const inventedLine = formatReport(invented)
		.split("\n")
		.find((line) => /\bZZ1\b/.test(line));
	if (inventedLine == null) {
		throw new Error("self-test: invented ZZ1 must appear in the report");
	}
	console.log(`coverage:rules invented-family proof: ${inventedLine}`);

	await fs.rm(zztmp, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (invented spec-v3 family ZZ is derived and reported, not failed)",
	);

	const optmp = await fs.mkdtemp(
		path.join(os.tmpdir(), "pen-coverage-rules-op-"),
	);
	const opSpecV2 = path.join(optmp, "spec-v2");
	const opSpecV3 = path.join(optmp, "spec-v3");
	const opTests = path.join(optmp, "packages", "core", "src", "__tests__");
	await fs.mkdir(opSpecV2, { recursive: true });
	await fs.mkdir(opSpecV3, { recursive: true });
	await fs.mkdir(opTests, { recursive: true });
	await fs.writeFile(
		path.join(opSpecV2, "09-reliability-testing.md"),
		`Rule: every normative rule ID in spec-v2 documents (I1–I12, HOST1–HOST6) must be claimed.\n`,
	);
	await fs.writeFile(
		path.join(opSpecV2, "fixture-v2.md"),
		"- I2. Mapping stays in range.\n",
	);
	await fs.writeFile(
		path.join(opSpecV3, "03-ops.md"),
		"- OP1. Closed union.\n- OPB1. Validate phase.\n",
	);
	await fs.writeFile(path.join(optmp, "claimed-scope.txt"), "I2\nOP1\n");
	await fs.writeFile(path.join(optmp, "gated-scope.txt"), "");
	await fs.writeFile(
		path.join(opTests, "ops.test.ts"),
		`import { describe, it } from "vitest";\ndescribe("ops", () => {\n  it("OPB1 keeps one executor", () => {});\n  it("I2 maps every pre-commit point into range or null", () => {});\n});\n`,
	);

	const contained = await runCoverage(
		optmp,
		"claimed-scope.txt",
		"gated-scope.txt",
	);
	if (
		!contained.derivedPrefixes.includes("OP") ||
		!contained.derivedPrefixes.includes("OPB")
	) {
		throw new Error(
			`self-test: OP and OPB must both be derived, got ${contained.derivedPrefixes.join(",")}`,
		);
	}
	if (!contained.claimedUnclaimed.includes("OP1")) {
		throw new Error(
			"self-test: a test named OPB1 must not claim OP1 (prefix containment)",
		);
	}
	if (contained.claimedUnclaimed.includes("OPB1")) {
		throw new Error(
			"self-test: OPB1 was named and is not claimed-scope; it must not fail",
		);
	}
	if (!contained.unlisted.includes("OPB1")) {
		throw new Error(
			`self-test: OPB1 must stay reported-not-failed, got ${contained.unlisted.join(",")}`,
		);
	}
	if ((contained.claims.get("OP1") ?? []).length > 0) {
		throw new Error(
			"self-test: OPB1 must not be recorded as a claim on OP1",
		);
	}
	if ((contained.claims.get("OPB1") ?? []).length === 0) {
		throw new Error("self-test: OPB1 must be recorded as its own claim");
	}

	await fs.rm(optmp, { recursive: true, force: true });
	console.log(
		"coverage:rules self-test ok (OPB1 does not claim OP1; both families stay distinct)",
	);
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
