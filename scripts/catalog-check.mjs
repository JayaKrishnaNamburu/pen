#!/usr/bin/env node
/**
 * LOC1 catalog completeness (spec-v2/16-localization.md).
 *
 * Both directions, inside already-known catalog areas only:
 * - every referenced `pen.<area>.*` key whose `<area>` already appears
 *   in a default catalog exists in that catalog
 * - every default-catalog key is referenced (or reserved)
 *
 * A referenced key in a *new* family (`pen.novel.foo`) is ignored.
 * That is deliberate (avoids random `pen.*` strings) and is not
 * "every referenced pen.* key". New families must be added to a
 * catalog file before this gate will notice their members.
 *
 * Reserved prefixes are documented allowlist, not silent holes:
 * - `pen.a11y.*` — Wave X announcements
 * - `pen.schema.*` / `pen.display.group.*` — resolved through schema helpers
 *
 * Fail-closed: a missing catalog file, zero catalog keys, or a walk
 * that finds zero source files is a skip of nothing and exits 1 by name.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

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

export function walk(dir, files = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return files;
		}
		throw error;
	}
	for (const entry of entries) {
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

export function keysInSource(source) {
	const keys = new Set();
	for (const match of source.matchAll(KEY_RE)) {
		keys.add(match[1]);
	}
	return keys;
}

export function isReserved(key, reservedPrefixes = RESERVED_PREFIXES) {
	return reservedPrefixes.some((prefix) => key.startsWith(prefix));
}

export function evaluateCatalog({
	catalogKeys,
	referenced,
	reservedPrefixes = RESERVED_PREFIXES,
	catalogFileCount,
	walkedFileCount,
	missingCatalogFiles = [],
}) {
	if (missingCatalogFiles.length > 0) {
		return {
			ok: false,
			reason: `LOC1: missing catalog file(s): ${missingCatalogFiles.join(", ")}`,
			missing: [],
			dead: [],
		};
	}
	if (catalogFileCount === 0 || catalogKeys.size === 0) {
		return {
			ok: false,
			reason: "LOC1: catalog files produced zero keys (skip of nothing)",
			missing: [],
			dead: [],
		};
	}
	if (walkedFileCount === 0) {
		return {
			ok: false,
			reason: "LOC1: walker found zero source files under packages/ (skip of nothing)",
			missing: [],
			dead: [],
		};
	}

	const missing = [...referenced]
		.filter((key) => !catalogKeys.has(key))
		.sort();
	const dead = [...catalogKeys]
		.filter(
			(key) => !referenced.has(key) && !isReserved(key, reservedPrefixes),
		)
		.sort();
	if (missing.length > 0 || dead.length > 0) {
		return {
			ok: false,
			reason: "LOC1: catalog completeness failed",
			missing,
			dead,
		};
	}
	return { ok: true, reason: null, missing: [], dead: [] };
}

export function runSelfTests() {
	const missingFile = evaluateCatalog({
		catalogKeys: new Set(),
		referenced: new Set(),
		catalogFileCount: 0,
		walkedFileCount: 10,
		missingCatalogFiles: ["packages/types/src/types/messages.ts"],
	});
	if (missingFile.ok || !/missing catalog file/.test(missingFile.reason)) {
		throw new Error("self-test: missing catalog file must fail by name");
	}

	const emptyKeys = evaluateCatalog({
		catalogKeys: new Set(),
		referenced: new Set(),
		catalogFileCount: 2,
		walkedFileCount: 10,
	});
	if (emptyKeys.ok || !/zero keys/.test(emptyKeys.reason)) {
		throw new Error("self-test: zero catalog keys must fail closed");
	}

	const emptyWalk = evaluateCatalog({
		catalogKeys: new Set(["pen.editor.foo"]),
		referenced: new Set(["pen.editor.foo"]),
		catalogFileCount: 1,
		walkedFileCount: 0,
	});
	if (emptyWalk.ok || !/zero source files/.test(emptyWalk.reason)) {
		throw new Error("self-test: empty walk must fail closed");
	}

	const healthy = evaluateCatalog({
		catalogKeys: new Set(["pen.editor.foo"]),
		referenced: new Set(["pen.editor.foo"]),
		catalogFileCount: 1,
		walkedFileCount: 4,
	});
	if (!healthy.ok) {
		throw new Error("self-test: matching catalog must pass");
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

function main() {
	runSelfTests();
	console.log("LOC1 catalog-check self-test ok");
	console.log(
		"  red-proof: missing catalog file, zero keys, and empty walk fail closed",
	);

	const args = parseArgs(process.argv.slice(2));
	const missingCatalogFiles = [];
	const catalogKeys = new Set();
	for (const rel of CATALOG_FILES) {
		const full = path.join(args.repoRoot, rel);
		try {
			for (const key of keysInSource(fs.readFileSync(full, "utf8"))) {
				catalogKeys.add(key);
			}
		} catch (error) {
			if (error && error.code === "ENOENT") {
				missingCatalogFiles.push(rel);
				continue;
			}
			throw error;
		}
	}

	const catalogAreas = new Set(
		[...catalogKeys].map((key) => key.split(".")[1]).filter(Boolean),
	);
	function isCatalogShaped(key) {
		return catalogAreas.has(key.split(".")[1]);
	}

	const catalogRel = new Set(CATALOG_FILES);
	const walked = walk(path.join(args.repoRoot, "packages"));
	const referenced = new Set();
	for (const file of walked) {
		const rel = path.relative(args.repoRoot, file);
		if (catalogRel.has(rel)) {
			continue;
		}
		for (const key of keysInSource(fs.readFileSync(file, "utf8"))) {
			if (isCatalogShaped(key)) {
				referenced.add(key);
			}
		}
	}

	const result = evaluateCatalog({
		catalogKeys,
		referenced,
		catalogFileCount: CATALOG_FILES.length - missingCatalogFiles.length,
		walkedFileCount: walked.length,
		missingCatalogFiles,
	});
	console.log(
		`population: ${walked.length} source files under packages/, ${catalogKeys.size} catalog keys, ${referenced.size} references`,
	);
	if (!result.ok) {
		console.error(result.reason);
		if (result.missing.length > 0) {
			console.error(
				"LOC1: referenced keys missing from the default catalogs:",
			);
			for (const key of result.missing) {
				console.error(`  ${key}`);
			}
		}
		if (result.dead.length > 0) {
			console.error("LOC1: default-catalog keys are not referenced:");
			for (const key of result.dead) {
				console.error(`  ${key}`);
			}
		}
		process.exitCode = 1;
		return;
	}
	console.log(
		`LOC1: catalog completeness ok (${catalogKeys.size} keys, ${referenced.size} references)`,
	);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
