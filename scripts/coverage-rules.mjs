#!/usr/bin/env node
/**
 * coverage:rules (Wave 0.6)
 *
 * Greps spec-v2 for rule-ID tokens (inventory prefixes from
 * spec-v2/09-reliability-testing.md "Rule:" line, plus later-wave
 * prefixes DUR/COL/AIB/IOP/SCALE) and greps tests for claims.
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
const DEFAULT_CLAIMED_SCOPE = path.join("scripts", "claimed-scope.txt");
const DEFAULT_GATED_SCOPE = path.join("scripts", "gated-scope.txt");
const WORKFLOW_DIR = ".github/workflows/";
const GATED_ROW_RE =
	/^([A-Z]+\d+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(.+)$/;

const EXTRA_PREFIXES = ["DUR", "COL", "AIB", "IOP", "SCALE"];

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
	return [...prefixes].sort(
		(a, b) => b.length - a.length || a.localeCompare(b),
	);
}

export function ruleIdRegex(prefixes) {
	const alternation = prefixes.map(escapeRegExp).join("|");
	return new RegExp(`\\b(?:${alternation})\\d+\\b`, "g");
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
		const match = id.match(/^([A-Z]+)(\d+)$/);
		if (match == null) {
			return false;
		}
		const prefix = match[1];
		const n = Number(match[2]);
		if (extra.has(prefix)) {
			return n >= 1;
		}
		const range = ranges.find((entry) => entry.prefix === prefix);
		if (range == null) {
			return false;
		}
		// API10 is specified in 09-reliability-testing.md after the inventory line.
		const max = prefix === "API" ? Math.max(range.to, 10) : range.to;
		return n >= range.from && n <= max;
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
	const specRoot = path.join(repoRoot, "spec-v2");
	const files = await walkFiles(specRoot, (filePath) =>
		filePath.endsWith(".md"),
	);
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
	return { ids, locations };
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
	return claims;
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
	const parse = (id) => {
		const match = id.match(/^([A-Z]+)(\d+)$/);
		return match == null ? [id, 0] : [match[1], Number(match[2])];
	};
	const [ap, an] = parse(a);
	const [bp, bn] = parse(b);
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
}) {
	const lines = [
		"coverage:rules",
		"",
		`Claimed scope (${claimedIds.length}): ${claimedIds.join(", ")}`,
		`Gated scope (${gatedRows.length}): ${gatedRows.map((row) => row.id).join(", ") || "(none)"}`,
		"",
	];

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
	const prefixes = prefixesFromRanges(ranges);
	const idRegex = ruleIdRegex(prefixes);
	const isRuleId = ruleIdPredicate(ranges);

	const claimedIds = parseClaimedScope(
		await fs.readFile(resolveRepoPath(repoRoot, claimedScopeRel), "utf8"),
	);
	const gatedRows = parseGatedScope(
		await fs.readFile(resolveRepoPath(repoRoot, gatedScopeRel), "utf8"),
	);
	const gateChecks = [];
	for (const row of gatedRows) {
		gateChecks.push(await verifyGatedRow(repoRoot, row));
	}
	const { ids: specIds } = await collectSpecIds(repoRoot, idRegex, isRuleId);
	const claims = await collectTestClaims(
		repoRoot,
		claimedIds,
		idRegex,
		isRuleId,
	);
	const result = evaluateCoverage({
		specIds,
		claimedIds,
		claims,
		gatedRows,
		gateChecks,
	});
	return { ...result, claimedIds, claims, gatedRows };
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
