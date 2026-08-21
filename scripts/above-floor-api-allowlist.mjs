#!/usr/bin/env node
/**
 * HOST4 allowlist schema (spec-v2/15-host-integration.md).
 *
 * `scripts/above-floor-api-allowlist.json` entries already name `api`,
 * `fallback`, and `degradation`. Sites used to be a bare path-string
 * array with no per-site reason — the parking-lot shape. A site is now
 * either a legacy string (grandfathered only while the eslint plugin
 * still matches strings) or `{ path, reason }`. New sites must be
 * objects with a reason. An object missing `path` or `reason` fails.
 *
 * The eslint rule `no-above-floor-api` still matches string sites
 * only (`typeof site === "string"`). A linted product file that needs
 * to silence the rule must keep a string site until that rule is
 * updated (out of this script's fence). Object sites are the schema;
 * strings are the plugin seam.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const ALLOWLIST = path.join("scripts", "above-floor-api-allowlist.json");

export function parseSite(site, index, api) {
	if (typeof site === "string") {
		if (site.trim().length === 0) {
			throw new Error(
				`${api} sites[${index}] string path must be non-empty`,
			);
		}
		return { path: site, reason: null, legacy: true };
	}
	if (site && typeof site === "object" && !Array.isArray(site)) {
		if (typeof site.path !== "string" || site.path.trim().length === 0) {
			throw new Error(
				`${api} sites[${index}] object needs a non-empty path`,
			);
		}
		if (
			typeof site.reason !== "string" ||
			site.reason.trim().length === 0
		) {
			throw new Error(
				`${api} sites[${index}] object needs a non-empty reason`,
			);
		}
		return {
			path: site.path,
			reason: site.reason.trim(),
			legacy: false,
		};
	}
	throw new Error(
		`${api} sites[${index}] must be a path string or { path, reason }`,
	);
}

export function evaluateAllowlist(raw) {
	if (!raw || !Array.isArray(raw.apis)) {
		throw new Error("above-floor-api-allowlist.json must have an apis array");
	}
	const sites = [];
	const legacyWithoutReason = [];
	for (const entry of raw.apis) {
		if (!entry || typeof entry.api !== "string" || entry.api.trim().length === 0) {
			throw new Error("each allowlist entry needs api");
		}
		if (
			typeof entry.fallback !== "string" ||
			entry.fallback.trim().length === 0
		) {
			throw new Error(`${entry.api} needs fallback`);
		}
		if (
			typeof entry.degradation !== "string" ||
			entry.degradation.trim().length === 0
		) {
			throw new Error(`${entry.api} needs degradation`);
		}
		if (!Array.isArray(entry.sites)) {
			throw new Error(`${entry.api} sites must be an array`);
		}
		for (let index = 0; index < entry.sites.length; index += 1) {
			const parsed = parseSite(entry.sites[index], index, entry.api);
			sites.push({ api: entry.api, ...parsed });
			if (parsed.legacy) {
				legacyWithoutReason.push({
					api: entry.api,
					path: parsed.path,
				});
			}
		}
	}
	return {
		ok: legacyWithoutReason.length === 0,
		sites,
		legacyWithoutReason,
	};
}

export function formatReport(result) {
	const lines = ["HOST4 above-floor-api allowlist"];
	lines.push("");
	lines.push(`sites               ${result.sites.length}`);
	lines.push(`legacy string sites ${result.legacyWithoutReason.length}`);
	if (result.legacyWithoutReason.length > 0) {
		lines.push("");
		lines.push(
			"FAIL new/legacy string sites need `{ path, reason }`. A bare path is the parking-lot shape:",
		);
		for (const hit of result.legacyWithoutReason) {
			lines.push(`  ${hit.api}  ${hit.path}`);
		}
	}
	if (result.ok) {
		lines.push("");
		lines.push(
			"OK: every site is `{ path, reason }` (or the list is empty).",
		);
	}
	return lines.join("\n");
}

export function runSelfTests() {
	const healthy = evaluateAllowlist({
		apis: [
			{
				api: "Intl.Segmenter",
				fallback: "code-point walk",
				degradation: "word ops become whitespace runs",
				sites: [
					{
						path: "packages/tooling/conformance/src/hosts/fixtureShape.test.js",
						reason: "Wave L LOC4: fixture asserts Segmenter so the fallback is exercised",
					},
				],
			},
		],
	});
	if (!healthy.ok || healthy.sites.length !== 1) {
		throw new Error("self-test: object site with reason must pass");
	}

	const empty = evaluateAllowlist({
		apis: [
			{
				api: "EditContext",
				fallback: "contenteditable",
				degradation: "IME uses composition events",
				sites: [],
			},
		],
	});
	if (!empty.ok) {
		throw new Error("self-test: empty sites must pass");
	}

	let missingReason = false;
	try {
		evaluateAllowlist({
			apis: [
				{
					api: "Intl.Segmenter",
					fallback: "code-point walk",
					degradation: "word ops become whitespace runs",
					sites: [{ path: "foo.js" }],
				},
			],
		});
	} catch (error) {
		missingReason = /reason/.test(
			error instanceof Error ? error.message : String(error),
		);
	}
	if (!missingReason) {
		throw new Error("self-test: object site without reason must fail closed");
	}

	const legacy = evaluateAllowlist({
		apis: [
			{
				api: "Intl.Segmenter",
				fallback: "code-point walk",
				degradation: "word ops become whitespace runs",
				sites: ["packages/tooling/conformance/src/hosts/fixtureShape.test.js"],
			},
		],
	});
	if (legacy.ok || legacy.legacyWithoutReason.length !== 1) {
		throw new Error(
			"self-test: a bare string site must fail (require { path, reason })",
		);
	}

	let missingFile = false;
	try {
		evaluateAllowlist({});
	} catch (error) {
		missingFile = /apis array/.test(
			error instanceof Error ? error.message : String(error),
		);
	}
	if (!missingFile) {
		throw new Error("self-test: missing apis array must fail by name");
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
	console.log("HOST4 above-floor-api-allowlist self-test ok");
	console.log(
		"  red-proof: object site without reason, bare string site, and missing apis fail closed",
	);

	const args = parseArgs(process.argv.slice(2));
	const allowlistPath = path.join(args.repoRoot, ALLOWLIST);
	let raw;
	try {
		raw = JSON.parse(await fs.readFile(allowlistPath, "utf8"));
	} catch (error) {
		if (error && error.code === "ENOENT") {
			console.error(`above-floor-api-allowlist: missing ${ALLOWLIST}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}
	const result = evaluateAllowlist(raw);
	console.log("");
	console.log(formatReport(result));
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
