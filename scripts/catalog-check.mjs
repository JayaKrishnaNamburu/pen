#!/usr/bin/env node
/**
 * LOC1 catalog completeness (spec-v2/16-localization.md).
 *
 * Both directions:
 * - every referenced `pen.*` key exists in a default catalog
 * - every default-catalog key is referenced (or reserved)
 *
 * Reserved prefixes are documented allowlist, not silent holes:
 * - `pen.a11y.*` — Wave X announcements
 * - `pen.schema.*` / `pen.display.group.*` — resolved through schema helpers
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const CATALOG_FILES = [
	"packages/types/src/types/messages.ts",
	"packages/schema/default/src/messages.ts",
];

const RESERVED_PREFIXES = ["pen.a11y.", "pen.schema.", "pen.display.group."];

const KEY_RE = /"(pen\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)"/g;
const SKIP_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".git",
	".turbo",
]);

function walk(dir, files = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIR_NAMES.has(entry.name)) {
			continue;
		}
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, files);
			continue;
		}
		if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
			files.push(full);
		}
	}
	return files;
}

function keysInFile(filePath) {
	const source = fs.readFileSync(filePath, "utf8");
	const keys = new Set();
	for (const match of source.matchAll(KEY_RE)) {
		keys.add(match[1]);
	}
	return keys;
}

function isReserved(key) {
	return RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function relative(filePath) {
	return path.relative(REPO_ROOT, filePath);
}

const catalogKeys = new Set();
for (const rel of CATALOG_FILES) {
	for (const key of keysInFile(path.join(REPO_ROOT, rel))) {
		catalogKeys.add(key);
	}
}

const catalogAreas = new Set(
	[...catalogKeys].map((key) => key.split(".")[1]).filter(Boolean),
);

function isCatalogShaped(key) {
	return catalogAreas.has(key.split(".")[1]);
}

const referenced = new Set();
const catalogRel = new Set(CATALOG_FILES);
for (const file of walk(path.join(REPO_ROOT, "packages"))) {
	if (catalogRel.has(relative(file))) {
		continue;
	}
	for (const key of keysInFile(file)) {
		if (isCatalogShaped(key)) {
			referenced.add(key);
		}
	}
}

const missing = [...referenced].filter((key) => !catalogKeys.has(key)).sort();
const dead = [...catalogKeys]
	.filter((key) => !referenced.has(key) && !isReserved(key))
	.sort();

if (missing.length > 0 || dead.length > 0) {
	if (missing.length > 0) {
		console.error("LOC1: referenced keys missing from the default catalogs:");
		for (const key of missing) {
			console.error(`  ${key}`);
		}
	}
	if (dead.length > 0) {
		console.error("LOC1: default-catalog keys are not referenced:");
		for (const key of dead) {
			console.error(`  ${key}`);
		}
	}
	process.exit(1);
}

console.log(
	`LOC1: catalog completeness ok (${catalogKeys.size} keys, ${referenced.size} references)`,
);
