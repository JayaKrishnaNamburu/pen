#!/usr/bin/env node
/**
 * API4 lint (spec-v2/14-api-and-packaging.md, Wave P step P.4).
 *
 * Greps @input/pen-* import specifiers in packages, examples, and playground.
 * A specifier is a hit when it uses a /src/ or /dist/ escape hatch, or when
 * its subpath is not a published exports key of the target workspace package
 * (including wildcard keys such as ./field-editor/*).
 *
 * Hits must be on the allowlist with a reason. Unmarked hits and stale
 * allowlist entries fail. This slice does not rewrite imports.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join("scripts", "pen-deep-imports-allowlist.json");

const SCAN_ROOTS = ["packages", "examples", "playground"];
const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".vue",
	".mts",
	".cts",
]);
const SPECIFIER_RE =
	/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"](@input\/pen-[^'"]+)['"]/g;
const ESCAPE_HATCH_RE = /\/(?:src|dist)(?:\/|$)/;

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

export function hitKey(entry) {
	return `${entry.file}:${entry.line}:${entry.specifier}`;
}

export function parseReasonedList(raw, fieldName, fileLabel) {
	const list = raw?.[fieldName];
	if (!Array.isArray(list)) {
		throw new Error(`${fileLabel} must have a ${fieldName} array`);
	}
	return list.map((entry, index) => {
		if (
			typeof entry?.file !== "string" ||
			typeof entry?.line !== "number" ||
			!Number.isInteger(entry.line) ||
			entry.line < 1 ||
			typeof entry?.specifier !== "string" ||
			typeof entry?.reason !== "string" ||
			entry.file.length === 0 ||
			entry.specifier.length === 0 ||
			entry.reason.trim().length === 0
		) {
			throw new Error(
				`${fileLabel} ${fieldName}[${index}] needs file, a positive integer line, specifier, and a non-empty reason`,
			);
		}
		return {
			file: entry.file.split(path.sep).join(path.posix.sep),
			line: entry.line,
			specifier: entry.specifier,
			reason: entry.reason.trim(),
		};
	});
}

export function resolvePackageName(specifier, packageNames) {
	for (const name of packageNames) {
		if (specifier === name || specifier.startsWith(`${name}/`)) {
			return name;
		}
	}
	return null;
}

export function exportKeyForSpecifier(packageName, specifier) {
	if (specifier === packageName) {
		return ".";
	}
	return `.${specifier.slice(packageName.length)}`;
}

export function matchesExportKey(exportKey, publishedKeys) {
	if (publishedKeys.has(exportKey)) {
		return true;
	}
	for (const key of publishedKeys) {
		if (!key.includes("*")) {
			continue;
		}
		const pattern = key.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
		if (new RegExp(`^${pattern}$`).test(exportKey)) {
			return true;
		}
	}
	return false;
}

export function isEscapeHatchSpecifier(specifier) {
	return ESCAPE_HATCH_RE.test(specifier);
}

export function isDeepImport(specifier, packages) {
	if (isEscapeHatchSpecifier(specifier)) {
		return true;
	}
	const packageName = resolvePackageName(specifier, packages.names);
	if (!packageName) {
		return /^@input\/pen-[^/]+\//.test(specifier);
	}
	if (specifier === packageName) {
		return false;
	}
	const exportKey = exportKeyForSpecifier(packageName, specifier);
	const publishedKeys = packages.exports.get(packageName) ?? new Set(["."]);
	return !matchesExportKey(exportKey, publishedKeys);
}

export function extractSpecifiers(source) {
	return [...source.matchAll(SPECIFIER_RE)].map((match) => match[1]);
}

export function evaluateDeepImportHits({ hits, allowlist }) {
	const allowlistByKey = new Map(allowlist.map((entry) => [hitKey(entry), entry]));
	const hitKeys = new Set(hits.map(hitKey));

	const allowed = [];
	const unexpected = [];

	for (const hit of hits) {
		const allowedEntry = allowlistByKey.get(hitKey(hit));
		if (allowedEntry) {
			allowed.push({ ...hit, reason: allowedEntry.reason });
			continue;
		}
		unexpected.push(hit);
	}

	const staleAllowlist = allowlist.filter((entry) => !hitKeys.has(hitKey(entry)));

	return {
		hits,
		allowed,
		unexpected,
		staleAllowlist,
	};
}

export function formatReport(result) {
	const lines = [
		"API4 no-pen-deep-imports inventory",
		"",
		`${result.hits.length} hit(s) in packages + examples + playground.`,
	];

	lines.push("");
	if (result.allowed.length === 0) {
		lines.push("Allowlisted: none");
	} else {
		lines.push(`Allowlisted (${result.allowed.length}):`);
		for (const entry of result.allowed) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unmarked deep import (add an allowlist reason or import a published export):",
		);
		for (const entry of result.unexpected) {
			lines.push(`  ${hitKey(entry)}`);
		}
	}

	if (result.staleAllowlist.length > 0) {
		lines.push("");
		lines.push("FAIL stale allowlist entries (no matching hit; remove them):");
		for (const entry of result.staleAllowlist) {
			lines.push(`  ${hitKey(entry)}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (!hasFailures(result)) {
		lines.push("");
		lines.push(
			`OK: ${result.hits.length} hit(s), ${result.allowed.length} allowlisted; every hit is accounted for.`,
		);
	}

	return lines.join("\n");
}

export function formatStepSummary(result) {
	const lines = [
		"## API4 no-pen-deep-imports inventory",
		"",
		`${result.hits.length} hit(s) in \`packages\`, \`examples\`, and \`playground\`.`,
		"",
		`**Allowlisted:** ${result.allowed.length}`,
	];

	lines.push("");
	lines.push("### Allowlisted");
	if (result.allowed.length === 0) {
		lines.push("");
		lines.push("_None._");
	} else {
		for (const entry of result.allowed) {
			lines.push(`- \`${hitKey(entry)}\` — ${entry.reason}`);
		}
	}

	if (hasFailures(result)) {
		lines.push("");
		lines.push("**Result:** fail — unmarked hits or stale allowlist entries.");
	} else {
		lines.push("");
		lines.push(
			"**Result:** ok — no unmarked `/src/`, `/dist/`, or unpublished `@input/pen-*` subpath.",
		);
	}

	return `${lines.join("\n")}\n`;
}

export function hasFailures(result) {
	return result.unexpected.length > 0 || result.staleAllowlist.length > 0;
}

export function runAPI4Fixture() {
	const srcSpecifier = ["@input/pen-core", "src", "editor", "foo"].join("/");
	const unpublishedSpecifier = ["@input/pen-core", "editor", "apply"].join("/");
	const publishedSpecifier = ["@input/pen-dom", "field-editor", "store"].join("/");
	const source = `import { x } from "${srcSpecifier}";\n`;
	const packages = {
		names: ["@input/pen-dom", "@input/pen-core"],
		exports: new Map([
			["@input/pen-core", new Set(["."])],
			["@input/pen-dom", new Set([".", "./field-editor", "./field-editor/*"])],
		]),
	};
	const specifiers = extractSpecifiers(source);
	if (specifiers.length !== 1 || specifiers[0] !== srcSpecifier) {
		throw new Error("API4: expected the fixture specifier to be extracted");
	}
	if (!isDeepImport(srcSpecifier, packages)) {
		throw new Error(`API4: expected ${srcSpecifier} in a temp string to fail the checker`);
	}
	if (!isDeepImport(unpublishedSpecifier, packages)) {
		throw new Error(`API4: expected unpublished ${unpublishedSpecifier} to fail the checker`);
	}
	if (isDeepImport(publishedSpecifier, packages) || isDeepImport("@input/pen-core", packages)) {
		throw new Error("API4: published exports must not be hits");
	}
}

async function collectPackageJsonFiles(directory, repoRoot, files) {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIR_NAMES.has(entry.name)) {
				await collectPackageJsonFiles(entryPath, repoRoot, files);
			}
			continue;
		}
		if (entry.isFile() && entry.name === "package.json") {
			files.push(entryPath);
		}
	}
}

function publishedExportKeys(manifest) {
	const keys = new Set();
	const exportsField = manifest.exports;
	if (exportsField == null) {
		keys.add(".");
		return keys;
	}
	if (typeof exportsField === "string") {
		keys.add(".");
		return keys;
	}
	if (typeof exportsField !== "object" || Array.isArray(exportsField)) {
		keys.add(".");
		return keys;
	}
	for (const key of Object.keys(exportsField)) {
		keys.add(key);
	}
	if (keys.size === 0) {
		keys.add(".");
	}
	return keys;
}

export async function loadWorkspacePackages(repoRoot) {
	const files = [];
	await collectPackageJsonFiles(path.join(repoRoot, "packages"), repoRoot, files);
	const exports = new Map();
	for (const filePath of files) {
		const manifest = JSON.parse(await fs.readFile(filePath, "utf8"));
		if (typeof manifest.name !== "string" || !manifest.name.startsWith("@input/pen-")) {
			continue;
		}
		exports.set(manifest.name, publishedExportKeys(manifest));
	}
	const names = [...exports.keys()].sort((left, right) => right.length - left.length);
	return { names, exports };
}

async function collectSourceFiles(directory, repoRoot, files) {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIR_NAMES.has(entry.name)) {
				await collectSourceFiles(entryPath, repoRoot, files);
			}
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			continue;
		}
		files.push(entryPath);
	}
}

export async function collectDeepImportHits(repoRoot, packages) {
	const files = [];
	for (const relRoot of SCAN_ROOTS) {
		await collectSourceFiles(path.join(repoRoot, relRoot), repoRoot, files);
	}
	files.sort((left, right) => left.localeCompare(right));

	const hits = [];
	for (const filePath of files) {
		const text = await fs.readFile(filePath, "utf8");
		const relPosix = path
			.relative(repoRoot, filePath)
			.split(path.sep)
			.join(path.posix.sep);
		const lines = text.split(/\r?\n/);
		for (let index = 0; index < lines.length; index += 1) {
			const seen = new Set();
			for (const specifier of extractSpecifiers(lines[index])) {
				if (seen.has(specifier) || !isDeepImport(specifier, packages)) {
					continue;
				}
				seen.add(specifier);
				hits.push({
					file: relPosix,
					line: index + 1,
					specifier,
				});
			}
		}
	}
	return hits;
}

async function loadReasonedList(repoRoot, relPath, fieldName) {
	const text = await fs.readFile(path.join(repoRoot, relPath), "utf8");
	return parseReasonedList(JSON.parse(text), fieldName, relPath);
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

async function writeStepSummary(markdown) {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (!summaryPath) {
		return;
	}
	await fs.appendFile(summaryPath, markdown);
}

async function main() {
	runAPI4Fixture();
	console.log("API4 fixture: @input/pen-core/src/editor/foo in a temp string failed the checker.");

	const args = parseArgs(process.argv.slice(2));
	const packages = await loadWorkspacePackages(args.repoRoot);
	const hits = await collectDeepImportHits(args.repoRoot, packages);
	const allowlist = await loadReasonedList(
		args.repoRoot,
		DEFAULT_ALLOWLIST,
		"entries",
	);
	const result = evaluateDeepImportHits({ hits, allowlist });
	const report = formatReport(result);
	console.log(report);
	await writeStepSummary(formatStepSummary(result));
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
