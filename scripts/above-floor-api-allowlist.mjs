#!/usr/bin/env node
/**
 * HOST4 allowlist schema (spec-v2/15-host-integration.md).
 *
 * A site is a legacy path string (still valid) or `{ path, reason }`.
 * New sites must be objects with a reason. A path-only object fails.
 * Bare strings stay valid so existing entries are not a forced rewrite;
 * they do not inherit a per-site reason — that is why new sites are
 * objects.
 *
 * Liveness: a site whose path is missing fails by name. If the file
 * exists, the named `api` string must still appear in it (cheap
 * substring — not an AST). Path existence alone is the weak form;
 * API-in-file is the stronger one this file can afford.
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

export function evaluateAllowlist(raw, { files } = {}) {
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

	const missingPaths = [];
	const missingApi = [];
	if (files !== undefined) {
		for (const site of sites) {
			const contents =
				site.path in files ? files[site.path] : null;
			if (contents == null) {
				missingPaths.push(site);
				continue;
			}
			if (!contents.includes(site.api)) {
				missingApi.push(site);
			}
		}
	}

	return {
		ok: missingPaths.length === 0 && missingApi.length === 0,
		sites,
		legacyWithoutReason,
		missingPaths,
		missingApi,
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
			"legacy string sites (valid; new sites must be `{ path, reason }`):",
		);
		for (const hit of result.legacyWithoutReason) {
			lines.push(`  ${hit.api}  ${hit.path}`);
		}
	}
	if (result.missingPaths.length > 0) {
		lines.push("");
		lines.push(
			"FAIL stale allowlist site (path does not exist; remove it):",
		);
		for (const hit of result.missingPaths) {
			lines.push(`  ${hit.api}  ${hit.path}`);
		}
	}
	if (result.missingApi.length > 0) {
		lines.push("");
		lines.push(
			"FAIL stale allowlist site (named API no longer appears in file):",
		);
		for (const hit of result.missingApi) {
			lines.push(`  ${hit.api}  ${hit.path}`);
		}
	}
	if (result.ok) {
		lines.push("");
		lines.push(
			"OK: sites are path strings or `{ path, reason }`; every path exists and still names its API.",
		);
	}
	return lines.join("\n");
}

export async function collectSiteFiles(repoRoot, sites) {
	const files = {};
	for (const site of sites) {
		if (site.path in files) {
			continue;
		}
		try {
			files[site.path] = await fs.readFile(
				path.join(repoRoot, site.path),
				"utf8",
			);
		} catch (error) {
			if (error && error.code === "ENOENT") {
				files[site.path] = null;
				continue;
			}
			throw error;
		}
	}
	return files;
}

const HEALTHY_ENTRY = {
	api: "Intl.Segmenter",
	fallback: "code-point walk",
	degradation: "word ops become whitespace runs",
	sites: [
		{
			path: "packages/tooling/conformance/src/hosts/fixtureShape.test.js",
			reason: "Node test; browser API floor does not apply",
		},
	],
};

export function runSelfTests() {
	const healthy = evaluateAllowlist(
		{ apis: [HEALTHY_ENTRY] },
		{
			files: {
				"packages/tooling/conformance/src/hosts/fixtureShape.test.js":
					"new Intl.Segmenter()",
			},
		},
	);
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

	const legacy = evaluateAllowlist(
		{
			apis: [
				{
					api: "Intl.Segmenter",
					fallback: "code-point walk",
					degradation: "word ops become whitespace runs",
					sites: [
						"packages/tooling/conformance/src/hosts/fixtureShape.test.js",
					],
				},
			],
		},
		{
			files: {
				"packages/tooling/conformance/src/hosts/fixtureShape.test.js":
					"Intl.Segmenter",
			},
		},
	);
	if (
		!legacy.ok ||
		legacy.legacyWithoutReason.length !== 1 ||
		legacy.legacyWithoutReason[0].path !==
			"packages/tooling/conformance/src/hosts/fixtureShape.test.js"
	) {
		throw new Error(
			"self-test: a bare string site must stay valid (legacy)",
		);
	}

	const missingPath = evaluateAllowlist(
		{
			apis: [
				{
					api: "Intl.Segmenter",
					fallback: "code-point walk",
					degradation: "word ops become whitespace runs",
					sites: [
						{
							path: "does-not-exist-mutation.ts",
							reason: "self-test stale path",
						},
					],
				},
			],
		},
		{ files: { "does-not-exist-mutation.ts": null } },
	);
	if (
		missingPath.ok ||
		missingPath.missingPaths[0]?.path !== "does-not-exist-mutation.ts"
	) {
		throw new Error("self-test: missing path must fail by name");
	}
	const missingPathReport = formatReport(missingPath);
	if (!missingPathReport.includes("does-not-exist-mutation.ts")) {
		throw new Error("self-test: missing-path report must name the path");
	}

	const missingApi = evaluateAllowlist(
		{
			apis: [
				{
					api: "Intl.Segmenter",
					fallback: "code-point walk",
					degradation: "word ops become whitespace runs",
					sites: [
						{
							path: "packages/tooling/conformance/src/hosts/fixtureShape.test.js",
							reason: "self-test missing API",
						},
					],
				},
			],
		},
		{
			files: {
				"packages/tooling/conformance/src/hosts/fixtureShape.test.js":
					"no constructor here",
			},
		},
	);
	if (
		missingApi.ok ||
		missingApi.missingApi[0]?.path !==
			"packages/tooling/conformance/src/hosts/fixtureShape.test.js" ||
		missingApi.missingApi[0]?.api !== "Intl.Segmenter"
	) {
		throw new Error("self-test: missing API must fail by name");
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
		"  red-proof: object site without reason, missing path, missing API, and missing apis fail closed; bare string sites stay valid",
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
	const schema = evaluateAllowlist(raw);
	const files = await collectSiteFiles(args.repoRoot, schema.sites);
	const result = evaluateAllowlist(raw, { files });
	console.log("");
	console.log(formatReport(result));
	if (!result.ok) {
		process.exitCode = 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
