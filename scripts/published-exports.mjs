#!/usr/bin/env node
/**
 * API4 published-exports check (spec/rules/api.md).
 *
 * Every published package must export `.` and `./package.json`. Extra keys
 * fail unless listed in scripts/published-exports-allowlist.json with a
 * reason. Unmarked keys and stale allowlist entries fail. This script does
 * not rewrite package.json.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join("scripts", "published-exports-allowlist.json");

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

const REQUIRED_EXPORT_KEYS = [".", "./package.json"];
const REQUIRED_EXPORT_KEY_SET = new Set(REQUIRED_EXPORT_KEYS);
const REASON_RE = /P\.4|P\.6|E\.3|T\.1|API4|first-class|subpath|escape hatch/i;

export function exportKey(entry) {
	return `${entry.package}:${entry.key}`;
}

export function publishedExportKeys(manifest) {
	const keys = [];
	const exportsField = manifest.exports;
	if (exportsField == null || typeof exportsField === "string") {
		return ["."];
	}
	if (typeof exportsField !== "object" || Array.isArray(exportsField)) {
		return ["."];
	}
	for (const key of Object.keys(exportsField)) {
		keys.push(key);
	}
	return keys.length > 0 ? keys : ["."];
}

export function parseAllowlist(raw) {
	const entries = raw?.entries;
	if (!Array.isArray(entries)) {
		throw new Error("published-exports-allowlist.json must have an entries array");
	}
	return entries.map((entry, index) => {
		if (
			typeof entry?.package !== "string" ||
			typeof entry?.key !== "string" ||
			typeof entry?.reason !== "string" ||
			entry.package.length === 0 ||
			entry.key.length === 0 ||
			REQUIRED_EXPORT_KEY_SET.has(entry.key) ||
			entry.reason.trim().length === 0
		) {
			throw new Error(
				`published-exports-allowlist.json entries[${index}] needs package, a non-required key, and a non-empty reason`,
			);
		}
		if (!REASON_RE.test(entry.reason)) {
			throw new Error(
				`published-exports-allowlist.json entries[${index}] reason must name API4 / the first-class subpath`,
			);
		}
		return {
			package: entry.package,
			key: entry.key,
			reason: entry.reason.trim(),
		};
	});
}

export function evaluatePublishedExports({ packages, allowlist }) {
	const extras = [];
	const missingRoot = [];
	const missingPackageJson = [];
	for (const pkg of packages) {
		const keys = pkg.keys ?? publishedExportKeys(pkg.packageJson ?? {});
		if (!keys.includes(".")) {
			missingRoot.push(pkg.name);
		}
		if (!keys.includes("./package.json")) {
			missingPackageJson.push(pkg.name);
		}
		for (const key of keys) {
			if (!REQUIRED_EXPORT_KEY_SET.has(key)) {
				extras.push({ package: pkg.name, key });
			}
		}
	}
	extras.sort((left, right) => exportKey(left).localeCompare(exportKey(right)));

	const allowByKey = new Map(allowlist.map((entry) => [exportKey(entry), entry]));
	const extraKeys = new Set(extras.map(exportKey));
	const unexpected = extras.filter((hit) => !allowByKey.has(exportKey(hit)));
	const allowed = extras
		.filter((hit) => allowByKey.has(exportKey(hit)))
		.map((hit) => ({ ...hit, reason: allowByKey.get(exportKey(hit)).reason }));
	const stale = allowlist.filter((entry) => !extraKeys.has(exportKey(entry)));

	return { extras, missingRoot, missingPackageJson, unexpected, allowed, stale };
}

export function hasFailures(result) {
	return (
		result.missingRoot.length > 0 ||
		(result.missingPackageJson?.length ?? 0) > 0 ||
		result.unexpected.length > 0 ||
		result.stale.length > 0
	);
}

export function formatReport(result) {
	const lines = ["API4 published exports"];
	lines.push("");
	lines.push(`extra keys     ${result.extras.length}  (allowlisted ${result.allowed.length})`);
	lines.push(`missing root   ${result.missingRoot.length}`);
	lines.push(`missing pkgjson ${result.missingPackageJson.length}`);
	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push("unmarked extra keys:");
		for (const hit of result.unexpected) {
			lines.push(`  ${hit.package} ${hit.key}`);
		}
	}
	if (result.stale.length > 0) {
		lines.push("");
		lines.push("stale allowlist entries:");
		for (const entry of result.stale) {
			lines.push(`  ${entry.package} ${entry.key}`);
		}
	}
	if (result.missingRoot.length > 0) {
		lines.push("");
		lines.push("missing `.` export:");
		for (const name of result.missingRoot) {
			lines.push(`  ${name}`);
		}
	}
	if (result.missingPackageJson.length > 0) {
		lines.push("");
		lines.push("missing `./package.json` export:");
		for (const name of result.missingPackageJson) {
			lines.push(`  ${name}`);
		}
	}
	if (!hasFailures(result)) {
		lines.push("");
		lines.push(
			"OK: every published package exports `.` and `./package.json`; extra keys match the allowlist.",
		);
	}
	return lines.join("\n");
}

export function runSelfTests() {
	const allowlist = parseAllowlist({
		entries: [
			{
				package: "@input/pen-react",
				key: "./ai",
				reason: "E.3 App Router entry; first-class feature surface, not a src/dist escape hatch.",
			},
		],
	});
	const matching = evaluatePublishedExports({
		packages: [
			{ name: "@input/pen-core", keys: [".", "./package.json"] },
			{ name: "@input/pen-react", keys: [".", "./package.json", "./ai"] },
		],
		allowlist,
	});
	if (hasFailures(matching) || matching.allowed.length !== 1) {
		throw new Error("self-test: matching extra key must pass");
	}

	const unmarked = evaluatePublishedExports({
		packages: [
			{ name: "@input/pen-core", keys: [".", "./package.json"] },
			{
				name: "@input/pen-react",
				keys: [".", "./package.json", "./ai", "./secret"],
			},
		],
		allowlist,
	});
	if (
		!unmarked.unexpected.some(
			(hit) => hit.package === "@input/pen-react" && hit.key === "./secret",
		)
	) {
		throw new Error("self-test: unmarked extra key must fail");
	}

	const stale = evaluatePublishedExports({
		packages: [{ name: "@input/pen-core", keys: [".", "./package.json"] }],
		allowlist,
	});
	if (!stale.stale.some((entry) => entry.key === "./ai")) {
		throw new Error("self-test: unused allowlist entry must be stale");
	}

	const noRoot = evaluatePublishedExports({
		packages: [{ name: "@input/pen-core", keys: ["./internal"] }],
		allowlist: [],
	});
	if (!noRoot.missingRoot.includes("@input/pen-core")) {
		throw new Error("self-test: missing `.` must fail");
	}

	const noPackageJson = evaluatePublishedExports({
		packages: [{ name: "@input/pen-core", keys: ["."] }],
		allowlist: [],
	});
	if (!noPackageJson.missingPackageJson.includes("@input/pen-core")) {
		throw new Error("self-test: missing `./package.json` must fail");
	}
}

async function collectPackageJsonPaths(directory, files) {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIR_NAMES.has(entry.name)) {
				await collectPackageJsonPaths(entryPath, files);
			}
			continue;
		}
		if (entry.isFile() && entry.name === "package.json") {
			files.push(entryPath);
		}
	}
}

export async function loadPublishedPackages(repoRoot) {
	const files = [];
	await collectPackageJsonPaths(path.join(repoRoot, "packages"), files);
	const packages = [];
	for (const filePath of files) {
		const packageJson = JSON.parse(await fs.readFile(filePath, "utf8"));
		if (packageJson.private === true || typeof packageJson.name !== "string") {
			continue;
		}
		packages.push({
			name: packageJson.name,
			keys: publishedExportKeys(packageJson),
			packageJson,
		});
	}
	packages.sort((left, right) => left.name.localeCompare(right.name));
	return packages;
}

async function loadAllowlist(repoRoot) {
	const raw = JSON.parse(
		await fs.readFile(path.join(repoRoot, DEFAULT_ALLOWLIST), "utf8"),
	);
	return parseAllowlist(raw);
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
	console.log("API4 published-exports self-test ok");

	const args = parseArgs(process.argv.slice(2));
	const packages = await loadPublishedPackages(args.repoRoot);
	if (packages.length === 0) {
		console.error(
			"published-exports: cannot check: packages/**/package.json walk matched 0 published manifests",
		);
		process.exitCode = 1;
		return;
	}
	console.log(
		`population: ${packages.length} published manifests (packages/**/package.json)`,
	);
	const allowlist = await loadAllowlist(args.repoRoot);
	const result = evaluatePublishedExports({ packages, allowlist });
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
