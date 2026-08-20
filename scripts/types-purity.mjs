#!/usr/bin/env node
/**
 * API3 types-package purity (spec-v2/14-api-and-packaging.md, Wave P step P.3).
 *
 * `@input/pen-types` must have zero `dependencies`. Its API report may contain
 * types, frozen values, brand constructors, and type-predicate guards. Any
 * other function or class is a P.3 leftover and must be listed in
 * `scripts/types-runtime-allowlist.json` until it relocates to core.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyExports } from "./api-reports.mjs";

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
		throw new Error("types-runtime-allowlist.json must have an entries array");
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
		if (entry.kind === "type" || entry.kind === "value" || entry.kind === "guard") {
			return false;
		}
		if (entry.kind === "function" && BRAND_CONSTRUCTORS.has(entry.name)) {
			return false;
		}
		return entry.kind === "function" || entry.kind === "class";
	});
}

export function evaluateTypesPurity({ dependencies, leftovers, allowlist }) {
	const depNames = Object.keys(dependencies ?? {});
	const allowByKey = new Map(allowlist.map((entry) => [exportKey(entry), entry]));
	const leftoverKeys = new Set(leftovers.map(exportKey));
	const unexpected = leftovers.filter((entry) => !allowByKey.has(exportKey(entry)));
	const stale = allowlist.filter((entry) => !leftoverKeys.has(exportKey(entry)));
	const allowed = leftovers
		.filter((entry) => allowByKey.has(exportKey(entry)))
		.map((entry) => ({ ...entry, reason: allowByKey.get(exportKey(entry)).reason }));
	return {
		depNames,
		unexpected,
		stale,
		allowed,
	};
}

export function hasFailures(result) {
	return (
		result.depNames.length > 0 ||
		result.unexpected.length > 0 ||
		result.stale.length > 0
	);
}

export function formatReport(result) {
	const lines = ["API3 types-package purity"];
	lines.push("");
	lines.push(`dependencies     ${result.depNames.length}`);
	lines.push(`runtime leftovers allowlisted ${result.allowed.length}`);
	lines.push(`unmarked         ${result.unexpected.length}`);
	if (result.depNames.length > 0) {
		lines.push("");
		lines.push("types package.json must have zero dependencies:");
		for (const name of result.depNames) {
			lines.push(`  ${name}`);
		}
	}
	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push("unmarked runtime exports (relocate or allowlist with a P.3 reason):");
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
	if (!hasFailures(result)) {
		lines.push("");
		lines.push(
			"OK: types has zero dependencies; remaining runtime exports are the P.3 allowlist.",
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
			(entry) => entry.name === "SchemaRegistryImpl" && entry.kind === "class",
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
	console.log("API3 types-purity self-test ok");

	const args = parseArgs(process.argv.slice(2));
	const typesJson = JSON.parse(
		await fs.readFile(path.join(args.repoRoot, TYPES_DIR, "package.json"), "utf8"),
	);
	const dts = await fs.readFile(
		path.join(args.repoRoot, TYPES_DIR, "dist", "index.d.ts"),
		"utf8",
	);
	const allowlist = parseAllowlist(
		JSON.parse(await fs.readFile(path.join(args.repoRoot, ALLOWLIST), "utf8")),
	);
	const leftovers = runtimeLeftovers(classifyExports(dts));
	const result = evaluateTypesPurity({
		dependencies: typesJson.dependencies,
		leftovers,
		allowlist,
	});
	console.log("");
	console.log(formatReport(result));
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
