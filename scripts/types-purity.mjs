#!/usr/bin/env node
/**
 * API3 types-package purity (spec-v2/14-api-and-packaging.md, Wave P step P.3).
 *
 * `@input/pen-types` must have zero `dependencies`. Its API report may contain
 * types, frozen values, brand constructors, and type-predicate guards. Any
 * other function or class is a P.3 leftover and must be listed in
 * `scripts/types-runtime-allowlist.json` until it relocates to core.
 *
 * Dist freshness is a local guard. CI runs `pnpm build` first
 * (`ci.yml` / `release.yml`), so the `.d.ts` is current by construction
 * and this path does not fire there. Do not add a CI flag for it.
 *
 * When type-input source is newer than `types/dist/index.d.ts`, a
 * clean purity scan is INCONCLUSIVE, not OK. Missing dist stays the
 * existing read failure. "stale" in this script means an allowlist
 * entry that is no longer a leftover — not an outdated `.d.ts`.
 *
 * The shipped leftover count is the artifact. Source can still hold
 * runtime functions that never reach the barrel or `dist` — those are
 * printed as unreachable so API3 is not judged on the artifact alone.
 * Unreachable functions do not fail the gate (deletion is a types-
 * package change); they exist so "only N left" cannot hide dead source.
 *
 * Source scan is `^export function` only — not a full AST, on purpose
 * (the api-extractor trap). Unexported helpers (`^function` /
 * `^async function`) are invisible to that count: a fixture of four
 * unexported helpers plus a matching empty `.d.ts` reports
 * "source-level runtime 0" and exits 0. Those helpers are printed as
 * the measured hole so "2 remaining" cannot be read as almost-pure.
 * They do not fail the gate. Chasing zero leftovers would invert the
 * DAG: generateId is required by crdt-yjs (below core);
 * logicalTextFromStored is required by export-json and
 * markdown-serialization (no core dep). Amend API3 to a bounded set.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyExports } from "./api-reports.mjs";
import {
	appendOutdatedDistLines,
	assessDistFreshness,
	runFreshnessSelfTests,
} from "./lib/distFreshness.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const TYPES_DIR = path.join("packages", "types");
const ALLOWLIST = path.join("scripts", "types-runtime-allowlist.json");
const BRAND_CONSTRUCTORS = new Set(["appId", "blockId", "docId", "zoneId"]);
const REASON_RE = /P\.3|API3|relocate|core schema/i;

function exportKey(entry) {
	return `${entry.kind}:${entry.name}`;
}

export function parseAllowlist(raw) {
	const entries = raw?.entries;
	if (!Array.isArray(entries)) {
		throw new Error(
			"types-runtime-allowlist.json must have an entries array",
		);
	}
	return entries.map((entry, index) => {
		if (
			typeof entry?.name !== "string" ||
			typeof entry?.kind !== "string" ||
			typeof entry?.reason !== "string" ||
			entry.name.length === 0 ||
			(entry.kind !== "function" && entry.kind !== "class") ||
			entry.reason.trim().length === 0
		) {
			throw new Error(
				`types-runtime-allowlist.json entries[${index}] needs name, kind function|class, and a reason`,
			);
		}
		if (!REASON_RE.test(entry.reason)) {
			throw new Error(
				`types-runtime-allowlist.json entries[${index}] reason must name P.3 / API3`,
			);
		}
		return {
			name: entry.name,
			kind: entry.kind,
			reason: entry.reason.trim(),
		};
	});
}

export function runtimeLeftovers(entries) {
	return entries.filter((entry) => {
		if (
			entry.kind === "type" ||
			entry.kind === "value" ||
			entry.kind === "guard"
		) {
			return false;
		}
		if (entry.kind === "function" && BRAND_CONSTRUCTORS.has(entry.name)) {
			return false;
		}
		return entry.kind === "function" || entry.kind === "class";
	});
}

export function collectSourceExportedFunctions(source) {
	const names = [];
	for (const match of source.matchAll(/^export function (\w+)/gm)) {
		names.push(match[1]);
	}
	return names;
}

export function collectSourceUnexportedFunctions(source) {
	const names = [];
	for (const match of source.matchAll(/^function (\w+)/gm)) {
		names.push(match[1]);
	}
	for (const match of source.matchAll(/^async function (\w+)/gm)) {
		names.push(match[1]);
	}
	return names;
}

export function isSourceTypePredicate(source, name) {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`export function ${escaped}\\s*\\([^)]*\\)\\s*:[^{]*\\bis\\b`,
	).test(source);
}

export function classifySourceRuntime({
	functions,
	leftoverNames,
	unexported = [],
}) {
	const leftoverSet = new Set(leftoverNames);
	const runtime = functions.filter(
		(entry) => !entry.isGuard && !BRAND_CONSTRUCTORS.has(entry.name),
	);
	return {
		total: runtime.length,
		shipped: runtime.filter((entry) => leftoverSet.has(entry.name)),
		unreachable: runtime.filter((entry) => !leftoverSet.has(entry.name)),
		unexported,
	};
}

export function evaluateTypesPurity({
	dependencies,
	leftovers,
	allowlist,
	outdatedDist = [],
	sourceRuntime = { total: 0, shipped: [], unreachable: [] },
}) {
	const depNames = Object.keys(dependencies ?? {});
	const allowByKey = new Map(
		allowlist.map((entry) => [exportKey(entry), entry]),
	);
	const leftoverKeys = new Set(leftovers.map(exportKey));
	const unexpected = leftovers.filter(
		(entry) => !allowByKey.has(exportKey(entry)),
	);
	const stale = allowlist.filter(
		(entry) => !leftoverKeys.has(exportKey(entry)),
	);
	const allowed = leftovers
		.filter((entry) => allowByKey.has(exportKey(entry)))
		.map((entry) => ({
			...entry,
			reason: allowByKey.get(exportKey(entry)).reason,
		}));
	return {
		depNames,
		unexpected,
		stale,
		allowed,
		outdatedDist,
		sourceRuntime,
	};
}

export function hasFailures(result) {
	return (
		result.depNames.length > 0 ||
		result.unexpected.length > 0 ||
		result.stale.length > 0
	);
}

export function hasInconclusive(result) {
	return (result.outdatedDist?.length ?? 0) > 0;
}

export function formatReport(result) {
	const lines = ["API3 types-package purity"];
	lines.push("");
	const sourceRuntime = result.sourceRuntime ?? {
		total: 0,
		shipped: [],
		unreachable: [],
		unexported: [],
	};
	const unexported = sourceRuntime.unexported ?? [];
	lines.push(`dependencies     ${result.depNames.length}`);
	lines.push(`runtime leftovers allowlisted ${result.allowed.length}`);
	lines.push(`unmarked         ${result.unexpected.length}`);
	lines.push(`scanner bound    ^export function`);
	lines.push(`source-level runtime ${sourceRuntime.total}`);
	lines.push(`  shipped        ${sourceRuntime.shipped.length}`);
	lines.push(`  unreachable    ${sourceRuntime.unreachable.length}`);
	lines.push(`unexported helpers ${unexported.length}`);
	lines.push(`outdated dist    ${result.outdatedDist?.length ?? 0}`);
	if (result.depNames.length > 0) {
		lines.push("");
		lines.push("types package.json must have zero dependencies:");
		for (const name of result.depNames) {
			lines.push(`  ${name}`);
		}
	}
	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"unmarked runtime exports (relocate or allowlist with a P.3 reason):",
		);
		for (const entry of result.unexpected) {
			lines.push(`  ${entry.kind} ${entry.name}`);
		}
	}
	if (result.stale.length > 0) {
		lines.push("");
		lines.push("stale allowlist entries:");
		for (const entry of result.stale) {
			lines.push(`  ${entry.kind} ${entry.name}`);
		}
	}
	if (sourceRuntime.unreachable.length > 0) {
		lines.push("");
		lines.push(
			"unreachable source runtime (exported in types/src, absent from dist; delete — they are not API3 leftovers):",
		);
		for (const entry of sourceRuntime.unreachable) {
			const where = entry.file ? `  (${entry.file})` : "";
			lines.push(`  function ${entry.name}${where}`);
		}
	}
	if (unexported.length > 0) {
		lines.push("");
		lines.push(
			"unexported source helpers (invisible to ^export function; measured hole, not a purity failure):",
		);
		for (const entry of unexported) {
			const where = entry.file ? `  (${entry.file})` : "";
			lines.push(`  function ${entry.name}${where}`);
		}
	}
	lines.push("");
	lines.push(
		"API3 leftover count is the published artifact, not source purity. Chasing zero inverts the DAG: generateId is required by crdt-yjs (below core); logicalTextFromStored is required by export-json and markdown-serialization (no core dep). Amend API3 to a bounded set.",
	);
	appendOutdatedDistLines(lines, result.outdatedDist ?? []);
	if (!hasFailures(result) && !hasInconclusive(result)) {
		lines.push("");
		lines.push(
			"OK: types has zero dependencies; remaining runtime exports are the P.3 allowlist.",
		);
	} else if (!hasFailures(result) && hasInconclusive(result)) {
		lines.push("");
		lines.push(
			`INCONCLUSIVE: types purity holds against the .d.ts, but ${result.outdatedDist.length} package(s) have type-input source newer than dist. That is not a pass.`,
		);
	} else if (hasFailures(result) && hasInconclusive(result)) {
		lines.push("");
		lines.push(
			`INCONCLUSIVE: ${result.outdatedDist.length} package(s) have type-input source newer than dist; purity results may be incomplete until those rebuild.`,
		);
	}
	return lines.join("\n");
}

export function runSelfTests() {
	const leftovers = runtimeLeftovers([
		{ name: "Editor", kind: "type" },
		{ name: "isFoo", kind: "guard" },
		{ name: "SLOT", kind: "value" },
		{ name: "blockId", kind: "function" },
		{ name: "defineBlock", kind: "function" },
		{ name: "SchemaRegistryImpl", kind: "class" },
	]);
	if (leftovers.length !== 2) {
		throw new Error("self-test: leftovers should be defineBlock + class");
	}

	const allowlist = parseAllowlist({
		entries: [
			{
				name: "defineBlock",
				kind: "function",
				reason: "P.3: relocate to @input/pen-core (API3)",
			},
		],
	});
	const unexpected = evaluateTypesPurity({
		dependencies: {},
		leftovers,
		allowlist,
	});
	if (
		!unexpected.unexpected.some(
			(entry) =>
				entry.name === "SchemaRegistryImpl" && entry.kind === "class",
		)
	) {
		throw new Error("self-test: unmarked class must fail");
	}

	const deps = evaluateTypesPurity({
		dependencies: { leftover: "1.0.0" },
		leftovers: [],
		allowlist: [],
	});
	if (!deps.depNames.includes("leftover")) {
		throw new Error("self-test: dependency must fail");
	}

	const outdatedOnly = evaluateTypesPurity({
		dependencies: {},
		leftovers: [],
		allowlist: [],
		outdatedDist: [{ package: "@input/pen-types", newerCount: 1 }],
	});
	if (hasFailures(outdatedOnly)) {
		throw new Error("self-test: outdated dist is not a purity failure");
	}
	if (!hasInconclusive(outdatedOnly)) {
		throw new Error("self-test: outdated dist is inconclusive");
	}
	const outdatedReport = formatReport(outdatedOnly);
	if (outdatedReport.includes("OK:")) {
		throw new Error("self-test: outdated dist must not print OK");
	}
	if (!outdatedReport.includes("INCONCLUSIVE:")) {
		throw new Error("self-test: outdated dist prints INCONCLUSIVE");
	}
	if (!outdatedReport.includes("@input/pen-types")) {
		throw new Error("self-test: INCONCLUSIVE names the package");
	}
	if (outdatedReport.includes("stale allowlist entries:")) {
		throw new Error("self-test: outdated dist is not a stale allowlist");
	}

	const unexpectedAndOutdated = evaluateTypesPurity({
		dependencies: {},
		leftovers,
		allowlist,
		outdatedDist: [{ package: "@input/pen-types", newerCount: 1 }],
	});
	if (!hasFailures(unexpectedAndOutdated)) {
		throw new Error(
			"self-test: an unmarked leftover still fails when dist is outdated",
		);
	}
	const unexpectedReport = formatReport(unexpectedAndOutdated);
	if (!unexpectedReport.includes("SchemaRegistryImpl")) {
		throw new Error(
			"self-test: outdated dist does not hide an unmarked leftover",
		);
	}

	if (
		collectSourceExportedFunctions(
			"export function isCollapsed() {}\nexport type X = 1;\nexport function generateId() {}\n",
		).join(",") !== "isCollapsed,generateId"
	) {
		throw new Error("self-test: source export function names");
	}
	if (
		collectSourceExportedFunctions(
			"export async function later() {}\nfunction hidden() {}\n",
		).join(",") !== ""
	) {
		throw new Error(
			"self-test: scanner bound misses export async and unexported function",
		);
	}
	const holeSource = [
		"function helperA() {}",
		"function helperB() {}",
		"async function helperC() {}",
		"function helperD() {}",
	].join("\n");
	if (
		collectSourceUnexportedFunctions(holeSource).join(",") !==
		"helperA,helperB,helperD,helperC"
	) {
		throw new Error("self-test: unexported helpers are the measured hole");
	}
	if (collectSourceExportedFunctions(holeSource).length !== 0) {
		throw new Error(
			"self-test: unexported helpers are invisible to ^export function",
		);
	}
	if (
		!isSourceTypePredicate(
			"export function isFoo(value: unknown): value is Foo { return true; }",
			"isFoo",
		)
	) {
		throw new Error("self-test: type-predicate guard");
	}
	if (
		isSourceTypePredicate(
			'export function generateId(): string { return ""; }',
			"generateId",
		)
	) {
		throw new Error("self-test: non-guard is not a type predicate");
	}
	const sourceRuntime = classifySourceRuntime({
		functions: [
			{ name: "isFoo", isGuard: true, file: "tools.ts" },
			{ name: "blockId", isGuard: false, file: "ids.ts" },
			{ name: "generateId", isGuard: false, file: "generateId.ts" },
			{ name: "isCollapsed", isGuard: false, file: "selectionV2.ts" },
		],
		leftoverNames: ["generateId"],
	});
	if (sourceRuntime.total !== 2) {
		throw new Error("self-test: source runtime excludes guards and brands");
	}
	if (
		sourceRuntime.shipped.map((entry) => entry.name).join(",") !==
		"generateId"
	) {
		throw new Error("self-test: shipped leftover is the artifact entry");
	}
	if (
		sourceRuntime.unreachable.map((entry) => entry.name).join(",") !==
		"isCollapsed"
	) {
		throw new Error("self-test: unreachable is source-only");
	}
	const sourceOnly = evaluateTypesPurity({
		dependencies: {},
		leftovers: [],
		allowlist: [],
		sourceRuntime,
	});
	if (hasFailures(sourceOnly)) {
		throw new Error(
			"self-test: unreachable source runtime is not a purity failure",
		);
	}
	const sourceReport = formatReport(sourceOnly);
	if (!sourceReport.includes("source-level runtime 2")) {
		throw new Error("self-test: report prints source-level count");
	}
	if (!sourceReport.includes("function isCollapsed")) {
		throw new Error("self-test: report names the unreachable function");
	}

	const holeRuntime = classifySourceRuntime({
		functions: [],
		leftoverNames: [],
		unexported: [
			{ name: "helperA", file: "a.ts" },
			{ name: "helperB", file: "b.ts" },
			{ name: "helperC", file: "c.ts" },
			{ name: "helperD", file: "d.ts" },
		],
	});
	if (holeRuntime.total !== 0) {
		throw new Error(
			"self-test: four unexported helpers report source-level runtime 0",
		);
	}
	const holeResult = evaluateTypesPurity({
		dependencies: {},
		leftovers: [],
		allowlist: [],
		sourceRuntime: holeRuntime,
	});
	if (hasFailures(holeResult)) {
		throw new Error(
			"self-test: unexported helpers are not a purity failure",
		);
	}
	const holeReport = formatReport(holeResult);
	if (!holeReport.includes("source-level runtime 0")) {
		throw new Error(
			"self-test: hole fixture prints source-level runtime 0",
		);
	}
	if (!holeReport.includes("unexported helpers 4")) {
		throw new Error("self-test: hole fixture prints the unexported count");
	}
	if (!holeReport.includes("scanner bound    ^export function")) {
		throw new Error("self-test: report names the scanner bound");
	}
	if (!holeReport.includes("Amend API3 to a bounded set")) {
		throw new Error("self-test: report names the API3 amendment");
	}
	if (!holeReport.includes("OK:")) {
		throw new Error(
			"self-test: hole fixture still exits as purity-green (do not force red)",
		);
	}
}

const IGNORE_DIR_NAMES = new Set(["__tests__", "node_modules", "dist"]);

async function collectTypesSourceFunctions(typesDir) {
	const files = [];
	await collectSourceFiles(path.join(typesDir, "src"), files);
	const functions = [];
	const unexported = [];
	for (const filePath of files) {
		const source = await fs.readFile(filePath, "utf8");
		const relative = path.relative(typesDir, filePath);
		for (const name of collectSourceExportedFunctions(source)) {
			functions.push({
				name,
				file: relative,
				isGuard: isSourceTypePredicate(source, name),
			});
		}
		for (const name of collectSourceUnexportedFunctions(source)) {
			unexported.push({
				name,
				file: relative,
			});
		}
	}
	functions.sort((left, right) => left.name.localeCompare(right.name));
	unexported.sort((left, right) => left.name.localeCompare(right.name));
	return { functions, unexported };
}

async function collectSourceFiles(directory, files) {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIR_NAMES.has(entry.name)) {
				await collectSourceFiles(entryPath, files);
			}
			continue;
		}
		if (
			entry.isFile() &&
			entry.name.endsWith(".ts") &&
			!entry.name.endsWith(".test.ts")
		) {
			files.push(entryPath);
		}
	}
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

async function main() {
	runSelfTests();
	await runFreshnessSelfTests();
	console.log("API3 types-purity self-test ok");
	console.log(
		"  red-proof: unmarked class, new dependency, and stale allowlist fail closed",
	);
	console.log(
		"  measured: four unexported helpers + empty .d.ts print source-level runtime 0 and stay purity-green",
	);

	const args = parseArgs(process.argv.slice(2));
	const typesDir = path.join(args.repoRoot, TYPES_DIR);
	const typesJson = JSON.parse(
		await fs.readFile(path.join(typesDir, "package.json"), "utf8"),
	);
	const dts = await fs.readFile(
		path.join(typesDir, "dist", "index.d.ts"),
		"utf8",
	);
	const allowlist = parseAllowlist(
		JSON.parse(
			await fs.readFile(path.join(args.repoRoot, ALLOWLIST), "utf8"),
		),
	);
	const leftovers = runtimeLeftovers(classifyExports(dts));
	const freshness = await assessDistFreshness({
		name: typesJson.name,
		dir: typesDir,
		packageJson: typesJson,
	});
	const outdatedDist =
		freshness.status === "outdated"
			? [{ package: typesJson.name, newerCount: freshness.newer.length }]
			: [];
	const sourceFunctions = await collectTypesSourceFunctions(typesDir);
	const sourceRuntime = classifySourceRuntime({
		functions: sourceFunctions.functions,
		leftoverNames: leftovers.map((entry) => entry.name),
		unexported: sourceFunctions.unexported,
	});
	const result = evaluateTypesPurity({
		dependencies: typesJson.dependencies,
		leftovers,
		allowlist,
		outdatedDist,
		sourceRuntime,
	});
	console.log("");
	console.log(formatReport(result));
	if (hasFailures(result) || hasInconclusive(result)) {
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
