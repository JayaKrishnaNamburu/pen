#!/usr/bin/env node
/**
 * API4 @internal stripping (spec/rules/api.md).
 *
 * Published .d.ts must not re-export symbols marked @internal.
 * Declaration emit sets stripInternal in tsconfig.base.json; tsup dts
 * configs repeat it so a package-local tsconfig cannot drop the flag.
 *
 * Needs built `dist` artifacts (`pnpm build`).
 *
 * Dist freshness is a local guard. CI runs `pnpm build` first
 * (`ci.yml` / `release.yml`), so the `.d.ts` is current by construction
 * and this path does not fire there. Do not add a CI flag for it.
 *
 * When type-input source is newer than a package's published `.d.ts`,
 * a clean leak scan is INCONCLUSIVE, not OK — matching internals
 * against a `.d.ts` that predates its source is not a pass. Missing
 * dist stays the existing failure. "stale" is not used here.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectExportNames } from "./api-reports.mjs";
import {
	appendOutdatedDistLines,
	collectOutdatedDist,
	runFreshnessSelfTests,
} from "./lib/distFreshness.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const TSCONFIG_BASE = "tsconfig.base.json";

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

const INTERNAL_EXPORT_RE =
	/\/\*\*\s*@internal\b[\s\S]*?\*\/\s*export\s+(?:async\s+)?(?:declare\s+)?(?:type\s+|interface\s+|class\s+|function\s+|const\s+|let\s+|var\s+|enum\s+)(\w+)/g;

export function collectInternalExportNames(source) {
	const names = new Set();
	for (const match of source.matchAll(INTERNAL_EXPORT_RE)) {
		names.add(match[1]);
	}
	return [...names].sort();
}

export function tsconfigEnablesStripInternal(tsconfig) {
	return tsconfig?.compilerOptions?.stripInternal === true;
}

export function tsupWiresStripInternal(source) {
	if (!/\bdts\s*:/.test(source)) {
		return true;
	}
	return /stripInternal\s*:\s*true/.test(source);
}

export function leakedInternalExports({ internals, exported }) {
	const exportedSet = new Set(exported);
	return internals.filter((name) => exportedSet.has(name));
}

export function evaluateStripInternal({
	stripInternalEnabled,
	tsupConfigs,
	leaks,
	outdatedDist = [],
}) {
	const disabledTsup = tsupConfigs.filter((entry) => !entry.wired);
	return {
		stripInternalEnabled: stripInternalEnabled === true,
		disabledTsup,
		leaks,
		outdatedDist,
	};
}

export function hasFailures(result) {
	return (
		result.stripInternalEnabled !== true ||
		result.disabledTsup.length > 0 ||
		result.leaks.length > 0
	);
}

export function hasInconclusive(result) {
	return (result.outdatedDist?.length ?? 0) > 0;
}

export function formatReport(result) {
	const lines = ["API4 @internal stripping"];
	lines.push("");
	lines.push(
		`tsconfig.base stripInternal  ${result.stripInternalEnabled ? "on" : "OFF"}`,
	);
	lines.push(`tsup configs missing flag   ${result.disabledTsup.length}`);
	lines.push(`leaked internals            ${result.leaks.length}`);
	lines.push(`outdated dist               ${result.outdatedDist?.length ?? 0}`);
	if (result.stripInternalEnabled !== true) {
		lines.push("");
		lines.push("tsconfig.base.json compilerOptions.stripInternal must be true.");
	}
	if (result.disabledTsup.length > 0) {
		lines.push("");
		lines.push("tsup configs with dts but no stripInternal:");
		for (const entry of result.disabledTsup) {
			lines.push(`  ${entry.path}`);
		}
	}
	if (result.leaks.length > 0) {
		lines.push("");
		lines.push("published .d.ts still exports @internal symbols:");
		for (const leak of result.leaks) {
			lines.push(`  ${leak.package} ${leak.name}  (${leak.file})`);
		}
	}
	appendOutdatedDistLines(lines, result.outdatedDist ?? []);
	if (!hasFailures(result) && !hasInconclusive(result)) {
		lines.push("");
		lines.push(
			"OK: stripInternal is on; marked internals are absent from published .d.ts.",
		);
	} else if (!hasFailures(result) && hasInconclusive(result)) {
		lines.push("");
		lines.push(
			`INCONCLUSIVE: no leaked internals found in the .d.ts, but ${result.outdatedDist.length} package(s) have type-input source newer than dist. That is not a pass.`,
		);
	} else if (hasFailures(result) && hasInconclusive(result)) {
		lines.push("");
		lines.push(
			`INCONCLUSIVE: ${result.outdatedDist.length} package(s) have type-input source newer than dist; leak results may be incomplete until those rebuild.`,
		);
	}
	return lines.join("\n");
}

export function runSelfTests() {
	if (
		collectInternalExportNames(
			"/** @internal Hosts use openTextStream. */\nexport function createTextStreamWriter() {}",
		).join(",") !== "createTextStreamWriter"
	) {
		throw new Error("self-test: @internal function name");
	}
	if (!tsconfigEnablesStripInternal({ compilerOptions: { stripInternal: true } })) {
		throw new Error("self-test: stripInternal true must pass");
	}
	if (tsconfigEnablesStripInternal({ compilerOptions: {} })) {
		throw new Error("self-test: missing stripInternal must fail");
	}
	if (!tsupWiresStripInternal("dts: { compilerOptions: { stripInternal: true } }")) {
		throw new Error("self-test: wired tsup must pass");
	}
	if (tsupWiresStripInternal("dts: true,")) {
		throw new Error("self-test: dts true without stripInternal must fail");
	}
	const leaks = leakedInternalExports({
		internals: ["createTextStreamWriter", "keepMe"],
		exported: ["createTextStreamWriter", "createEditor"],
	});
	if (leaks.join(",") !== "createTextStreamWriter") {
		throw new Error("self-test: leaked export");
	}

	const outdatedOnly = evaluateStripInternal({
		stripInternalEnabled: true,
		tsupConfigs: [{ path: "pkg/tsup.config.ts", wired: true }],
		leaks: [],
		outdatedDist: [{ package: "@input/pen-freshness-fixture", newerCount: 1 }],
	});
	if (hasFailures(outdatedOnly)) {
		throw new Error("self-test: outdated dist is not a leak failure");
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
	if (!outdatedReport.includes("@input/pen-freshness-fixture")) {
		throw new Error("self-test: INCONCLUSIVE names the package");
	}
	if (!outdatedReport.includes("rebuild: pnpm --filter @input/pen-freshness-fixture build")) {
		throw new Error("self-test: INCONCLUSIVE names the rebuild");
	}

	const leakAndOutdated = evaluateStripInternal({
		stripInternalEnabled: true,
		tsupConfigs: [{ path: "pkg/tsup.config.ts", wired: true }],
		leaks: [
			{
				package: "@input/pen-freshness-fixture",
				name: "createTextStreamWriter",
				file: "packages/fixture/dist/index.d.ts",
			},
		],
		outdatedDist: [{ package: "@input/pen-freshness-fixture", newerCount: 1 }],
	});
	if (!hasFailures(leakAndOutdated)) {
		throw new Error("self-test: a leak still fails when dist is outdated");
	}
	const leakReport = formatReport(leakAndOutdated);
	if (!leakReport.includes("published .d.ts still exports @internal symbols:")) {
		throw new Error("self-test: outdated dist does not hide a leak");
	}
	if (!leakReport.includes("createTextStreamWriter")) {
		throw new Error("self-test: leak name still printed when dist is outdated");
	}
}

async function collectFiles(directory, files, nameTest) {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIR_NAMES.has(entry.name)) {
				await collectFiles(entryPath, files, nameTest);
			}
			continue;
		}
		if (entry.isFile() && nameTest(entry.name, entryPath)) {
			files.push(entryPath);
		}
	}
}

async function loadPublishedPackages(repoRoot) {
	const files = [];
	await collectFiles(path.join(repoRoot, "packages"), files, (name) => name === "package.json");
	const packages = [];
	for (const filePath of files) {
		const packageJson = JSON.parse(await fs.readFile(filePath, "utf8"));
		if (packageJson.private === true || typeof packageJson.name !== "string") {
			continue;
		}
		packages.push({
			name: packageJson.name,
			dir: path.dirname(filePath),
			packageJson,
		});
	}
	packages.sort((left, right) => left.name.localeCompare(right.name));
	return packages;
}

async function collectPackageInternals(packageDir) {
	const files = [];
	await collectFiles(path.join(packageDir, "src"), files, (name) =>
		name.endsWith(".ts") || name.endsWith(".tsx"),
	);
	const names = new Set();
	for (const filePath of files) {
		const source = await fs.readFile(filePath, "utf8");
		for (const name of collectInternalExportNames(source)) {
			names.add(name);
		}
	}
	return [...names].sort();
}

async function collectPublishedDts(packageDir) {
	const files = [];
	const distDir = path.join(packageDir, "dist");
	try {
		await collectFiles(distDir, files, (name) => name.endsWith(".d.ts"));
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			throw new Error(`missing dist at ${distDir}; run pnpm build first`, {
				cause: error,
			});
		}
		throw error;
	}
	return files;
}

async function loadTsupConfigs(repoRoot) {
	const files = [];
	await collectFiles(path.join(repoRoot, "packages"), files, (name) => name === "tsup.config.ts");
	const configs = [];
	for (const filePath of files) {
		const source = await fs.readFile(filePath, "utf8");
		configs.push({
			path: path.relative(repoRoot, filePath),
			wired: tsupWiresStripInternal(source),
		});
	}
	return configs;
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
	console.log("API4 strip-internal self-test ok");

	const args = parseArgs(process.argv.slice(2));
	const tsconfig = JSON.parse(
		await fs.readFile(path.join(args.repoRoot, TSCONFIG_BASE), "utf8"),
	);
	const tsupConfigs = await loadTsupConfigs(args.repoRoot);
	const packages = await loadPublishedPackages(args.repoRoot);
	if (packages.length === 0) {
		console.error(
			"strip-internal: cannot check: packages/**/package.json walk matched 0 published manifests",
		);
		process.exitCode = 1;
		return;
	}
	console.log(
		`population: ${packages.length} published manifests (packages/**/package.json)`,
	);
	const outdatedDist = await collectOutdatedDist(packages);
	const leaks = [];
	for (const pkg of packages) {
		const internals = await collectPackageInternals(pkg.dir);
		if (internals.length === 0) {
			continue;
		}
		const dtsFiles = await collectPublishedDts(pkg.dir);
		for (const dtsPath of dtsFiles) {
			const exported = [...collectExportNames(await fs.readFile(dtsPath, "utf8")).keys()];
			for (const name of leakedInternalExports({ internals, exported })) {
				leaks.push({
					package: pkg.name,
					name,
					file: path.relative(args.repoRoot, dtsPath),
				});
			}
		}
	}
	leaks.sort((left, right) => {
		const byPackage = left.package.localeCompare(right.package);
		return byPackage !== 0 ? byPackage : left.name.localeCompare(right.name);
	});

	const result = evaluateStripInternal({
		stripInternalEnabled: tsconfigEnablesStripInternal(tsconfig),
		tsupConfigs,
		leaks,
		outdatedDist,
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
