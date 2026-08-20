#!/usr/bin/env node
/**
 * API4 API-report check (spec-v2/14-api-and-packaging.md, Wave P step P.4).
 *
 * Each published package commits `api-report.md` next to its package.json.
 * This script generates the report from the published `.d.ts` and fails when
 * the committed file differs. A report diff is the public-surface gate;
 * CONTRIBUTING also asks for the `api-change` label and a changeset.
 *
 * Needs built `dist` artifacts (`pnpm build`). `--write` refreshes the files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPORT_NAME = "api-report.md";

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

const KIND_ORDER = ["class", "function", "guard", "value", "type"];

export function splitExportSpecifiers(inner) {
	const specs = [];
	for (const raw of inner.split(",")) {
		const spec = raw.trim();
		if (spec.length === 0) {
			continue;
		}
		const typeOnly = spec.startsWith("type ");
		const rest = typeOnly ? spec.slice(5).trim() : spec;
		const renamed = rest.match(/^(\S+)\s+as\s+(\S+)$/);
		specs.push({
			typeOnly,
			exported: renamed ? renamed[2] : rest,
		});
	}
	return specs;
}

export function collectExportNames(text) {
	const names = new Map();
	for (const match of text.matchAll(/export\s*\{([^}]+)\}/g)) {
		for (const spec of splitExportSpecifiers(match[1])) {
			names.set(spec.exported, spec.typeOnly);
		}
	}
	const named = [
		[/export\s+type\s+(\w+)/g, true],
		[/export\s+interface\s+(\w+)/g, true],
		[/export\s+(?:declare\s+)?(?:async\s+)?function\s+(\w+)/g, false],
		[/export\s+(?:declare\s+)?class\s+(\w+)/g, false],
		[/export\s+(?:declare\s+)?const\s+(\w+)/g, false],
	];
	for (const [pattern, typeOnly] of named) {
		for (const match of text.matchAll(pattern)) {
			if (!names.has(match[1])) {
				names.set(match[1], typeOnly);
			}
		}
	}
	return names;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function declarationKind(text, name) {
	const escaped = escapeRegExp(name);
	const functionRe = new RegExp(
		`(?:export\\s+)?(?:declare\\s+)?(?:async\\s+)?function\\s+${escaped}\\b[^{;]*`,
		"g",
	);
	const functionHits = [...text.matchAll(functionRe)].map((match) => match[0]);
	if (functionHits.length > 0) {
		if (functionHits.some((hit) => /\):\s*\S+\s+is\b/.test(hit))) {
			return "guard";
		}
		return "function";
	}
	const classRe = new RegExp(
		`(?:export\\s+)?(?:declare\\s+)?class\\s+${escaped}\\b`,
	);
	if (classRe.test(text)) {
		return "class";
	}
	return "value";
}

export function classifyExports(text) {
	const names = collectExportNames(text);
	const entries = [];
	for (const [name, typeOnly] of names) {
		if (typeOnly) {
			entries.push({ name, kind: "type" });
			continue;
		}
		entries.push({ name, kind: declarationKind(text, name) });
	}
	entries.sort((left, right) => {
		const kind = KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
		if (kind !== 0) {
			return kind;
		}
		return left.name.localeCompare(right.name);
	});
	return entries;
}

export function renderApiReport({ packageName, surfaces }) {
	const lines = [`# ${packageName}`, ""];
	for (const surface of surfaces) {
		lines.push(`## ${surface.key}`);
		lines.push("");
		lines.push(`\`${surface.typesPath}\``);
		lines.push("");
		if (surface.globFiles) {
			lines.push("glob members:");
			lines.push("");
			for (const file of surface.globFiles) {
				lines.push(`- ${file}`);
			}
			if (surface.globFiles.length === 0) {
				lines.push("_no matching files_");
			}
			lines.push("");
			continue;
		}
		let currentKind = null;
		for (const entry of surface.entries) {
			if (entry.kind !== currentKind) {
				if (currentKind !== null) {
					lines.push("");
				}
				lines.push(`### ${entry.kind}`);
				lines.push("");
				currentKind = entry.kind;
			}
			lines.push(`- ${entry.name}`);
		}
		if (surface.entries.length === 0) {
			lines.push("_no exports_");
		}
		lines.push("");
	}
	return `${lines.join("\n").trimEnd()}\n`;
}

async function expandTypesGlob(packageDir, specifier) {
	const star = specifier.indexOf("*");
	const prefix = specifier.slice(0, star);
	const suffix = specifier.slice(star + 1);
	const directory = path.join(packageDir, prefix);
	let names;
	try {
		names = await fs.readdir(directory);
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return { status: "missing", files: [] };
		}
		throw error;
	}
	const files = names
		.filter((name) => name.endsWith(suffix) && !name.endsWith(".d.cts"))
		.sort((left, right) => left.localeCompare(right));
	return { status: "ok", files };
}

export function typesSpecifier(exportEntry) {
	if (exportEntry == null) {
		return null;
	}
	if (typeof exportEntry === "string") {
		return null;
	}
	if (typeof exportEntry.types === "string") {
		return exportEntry.types;
	}
	if (typeof exportEntry.import === "object" && exportEntry.import != null) {
		if (typeof exportEntry.import.types === "string") {
			return exportEntry.import.types;
		}
	}
	if (typeof exportEntry.require === "object" && exportEntry.require != null) {
		if (typeof exportEntry.require.types === "string") {
			return exportEntry.require.types;
		}
	}
	return null;
}

export function exportKeys(manifest) {
	const exportsField = manifest.exports;
	if (exportsField == null || typeof exportsField === "string") {
		return ["."];
	}
	if (typeof exportsField !== "object" || Array.isArray(exportsField)) {
		return ["."];
	}
	const keys = Object.keys(exportsField);
	return keys.length > 0 ? keys : ["."];
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
			dir: path.dirname(filePath),
			keys: exportKeys(packageJson),
			packageJson,
		});
	}
	packages.sort((left, right) => left.name.localeCompare(right.name));
	return packages;
}

export async function buildPackageReport(pkg) {
	const surfaces = [];
	const missing = [];
	const exportsField = pkg.packageJson.exports;
	for (const key of pkg.keys) {
		const entry =
			exportsField == null || typeof exportsField === "string"
				? { types: pkg.packageJson.types ?? "./dist/index.d.ts" }
				: exportsField[key];
		const specifier =
			typesSpecifier(entry) ??
			(key === "." ? (pkg.packageJson.types ?? "./dist/index.d.ts") : null);
		if (specifier == null) {
			missing.push(`${pkg.name} ${key}: no types specifier`);
			continue;
		}
		if (specifier.includes("*")) {
			const expanded = await expandTypesGlob(pkg.dir, specifier);
			if (expanded.status === "missing") {
				missing.push(`${pkg.name} ${key}: missing ${specifier} (run pnpm build)`);
				continue;
			}
			surfaces.push({
				key,
				typesPath: specifier,
				globFiles: expanded.files,
				entries: [],
			});
			continue;
		}
		const typesPath = path.join(pkg.dir, specifier);
		try {
			const text = await fs.readFile(typesPath, "utf8");
			surfaces.push({
				key,
				typesPath: specifier,
				entries: classifyExports(text),
			});
		} catch (error) {
			if (error && error.code === "ENOENT") {
				missing.push(`${pkg.name} ${key}: missing ${specifier} (run pnpm build)`);
				continue;
			}
			throw error;
		}
	}
	return {
		report: renderApiReport({ packageName: pkg.name, surfaces }),
		missing,
		reportPath: path.join(pkg.dir, REPORT_NAME),
	};
}

export function diffReports(expected, actual) {
	if (expected === actual) {
		return null;
	}
	return { expected, actual };
}

export function runSelfTests() {
	const dts = `
declare function isFoo(value: unknown): value is Foo;
declare function isBar(value: unknown): value is {
    ok: true;
};
declare function doWork(value: string): string;
declare class Box {}
declare const FLAG = 1;
type Foo = { ok: true };
export { type Foo, isFoo, isBar, doWork, Box, FLAG };
`;
	const entries = classifyExports(dts);
	const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry.kind]));
	if (byName.Foo !== "type") {
		throw new Error("self-test: type export");
	}
	if (byName.isFoo !== "guard" || byName.isBar !== "guard") {
		throw new Error("self-test: type-predicate function is a guard");
	}
	if (byName.doWork !== "function") {
		throw new Error("self-test: plain function");
	}
	if (byName.Box !== "class") {
		throw new Error("self-test: class");
	}
	if (byName.FLAG !== "value") {
		throw new Error("self-test: const");
	}

	const rendered = renderApiReport({
		packageName: "@input/pen-types",
		surfaces: [{ key: ".", typesPath: "./dist/index.d.ts", entries }],
	});
	if (!rendered.startsWith("# @input/pen-types\n")) {
		throw new Error("self-test: report title");
	}
	if (!rendered.includes("### guard\n\n- isBar\n- isFoo")) {
		throw new Error("self-test: guard section");
	}
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let write = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--write") {
			write = true;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, write };
}

export async function evaluateApiReports({ packages, write }) {
	const stale = [];
	const missing = [];
	const written = [];
	for (const pkg of packages) {
		const built = await buildPackageReport(pkg);
		missing.push(...built.missing);
		if (built.missing.length > 0) {
			continue;
		}
		let committed = null;
		try {
			committed = await fs.readFile(built.reportPath, "utf8");
		} catch (error) {
			if (error && error.code !== "ENOENT") {
				throw error;
			}
		}
		if (write) {
			await fs.writeFile(built.reportPath, built.report);
			written.push(pkg.name);
			continue;
		}
		if (committed == null || committed !== built.report) {
			stale.push({
				package: pkg.name,
				path: built.reportPath,
				missing: committed == null,
			});
		}
	}
	return { stale, missing, written };
}

function formatReport(result) {
	const lines = ["API4 API reports"];
	lines.push("");
	lines.push(`stale/missing reports  ${result.stale.length}`);
	lines.push(`missing .d.ts          ${result.missing.length}`);
	if (result.written.length > 0) {
		lines.push(`written                ${result.written.length}`);
	}
	if (result.stale.length > 0) {
		lines.push("");
		lines.push("report drift (run `node scripts/api-reports.mjs --write`):");
		for (const hit of result.stale) {
			lines.push(`  ${hit.package}${hit.missing ? " (missing file)" : ""}`);
		}
	}
	if (result.missing.length > 0) {
		lines.push("");
		lines.push("missing type artifacts:");
		for (const hit of result.missing) {
			lines.push(`  ${hit}`);
		}
	}
	if (result.stale.length === 0 && result.missing.length === 0) {
		lines.push("");
		lines.push("OK: committed API reports match the published .d.ts surfaces.");
	}
	return lines.join("\n");
}

async function main() {
	runSelfTests();
	console.log("API4 api-reports self-test ok");

	const args = parseArgs(process.argv.slice(2));
	const packages = await loadPublishedPackages(args.repoRoot);
	const result = await evaluateApiReports({ packages, write: args.write });
	console.log("");
	console.log(formatReport(result));
	if (result.stale.length > 0 || result.missing.length > 0) {
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
