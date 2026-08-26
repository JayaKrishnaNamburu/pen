#!/usr/bin/env node
/**
 * F22 pin (dead-binding audit finding).
 *
 * Wave H ticked F22 by wiring the streaming accumulators and deleting
 * `hasWarnedAboutWithoutOption`. The lint host that found them
 * (`prefer-const`, `no-unused-vars`) is still warn-only on purpose, so
 * the removed pattern can come back without failing CI. This script is
 * the pin that a tick without a test is not.
 *
 *   node scripts/f22-dead-bindings.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

export const FORBIDDEN_IDENTIFIER = "hasWarnedAboutWithoutOption";

export const STREAMING_ACCUMULATORS = [
	"currentText",
	"blockStreamingStarted",
	"streamedSuggestionInitialized",
	"streamedSuggestionLength",
	"streamedMarkdownSuggestionIds",
	"lastStreamedMarkdownPreviewText",
];

export const WRITE_FILES = [
	"packages/extensions/ai/src/controller/generationExecutionLoop.ts",
	"packages/extensions/ai/src/controller/generationExecutionFinalize.ts",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

const FORBIDDEN_RE = /\bhasWarnedAboutWithoutOption\b/g;

export function accumulatorWriteRe(name) {
	return new RegExp(String.raw`\bstate\.${name}\s*(?:\+=|=(?!=))`, "g");
}

export function extractForbiddenHits(source, file) {
	const hits = [];
	for (const match of source.matchAll(FORBIDDEN_RE)) {
		hits.push({
			file,
			line: offsetToLine(source, match.index),
		});
	}
	return hits;
}

export function findAccumulatorWrites(source, name) {
	return [...source.matchAll(accumulatorWriteRe(name))];
}

export function evaluateF22({ forbiddenHits, writeSources }) {
	const missingFiles = [];
	const missingWrites = [];

	for (const rel of WRITE_FILES) {
		if (!Object.hasOwn(writeSources, rel)) {
			missingFiles.push(rel);
		}
	}

	const combined = WRITE_FILES.map((rel) => writeSources[rel] ?? "").join(
		"\n",
	);
	for (const name of STREAMING_ACCUMULATORS) {
		if (findAccumulatorWrites(combined, name).length === 0) {
			missingWrites.push(name);
		}
	}

	return {
		forbiddenHits,
		missingFiles,
		missingWrites,
	};
}

export function hasFailures(result) {
	return (
		result.forbiddenHits.length > 0 ||
		result.missingFiles.length > 0 ||
		result.missingWrites.length > 0
	);
}

export function formatReport(result) {
	const lines = [
		"F22 dead-binding pin",
		"",
		`${result.forbiddenHits.length} hasWarnedAboutWithoutOption hit(s).`,
		`${result.missingWrites.length} streaming accumulator(s) with no write.`,
		`${result.missingFiles.length} missing write-file(s).`,
	];

	if (result.forbiddenHits.length > 0) {
		lines.push("");
		lines.push("FAIL hasWarnedAboutWithoutOption reintroduced:");
		for (const hit of result.forbiddenHits) {
			lines.push(`  ${hit.file}:${hit.line}`);
		}
	}

	if (result.missingFiles.length > 0) {
		lines.push("");
		lines.push("FAIL generation write files missing:");
		for (const file of result.missingFiles) {
			lines.push(`  ${file}`);
		}
	}

	if (result.missingWrites.length > 0) {
		lines.push("");
		lines.push(
			"FAIL streaming accumulators never written (F22 dead-binding shape):",
		);
		for (const name of result.missingWrites) {
			lines.push(`  state.${name}`);
		}
	}

	if (!hasFailures(result)) {
		lines.push("");
		lines.push(
			"ok — warn-once flag stays gone; streaming accumulators stay written.",
		);
	}

	return lines.join("\n");
}

export function runF22Fixture() {
	const forbiddenSource = "let hasWarnedAboutWithoutOption = false;\n";
	const forbiddenHits = extractForbiddenHits(
		forbiddenSource,
		"tmp/f22-fixture.ts",
	);
	if (forbiddenHits.length !== 1 || forbiddenHits[0].line !== 1) {
		throw new Error("F22: expected the warn-once identifier to be extracted");
	}

	const deadLoop = [
		"function consume(state) {",
		"  reader(state.currentText);",
		"  reader(state.blockStreamingStarted);",
		"  reader(state.streamedSuggestionInitialized);",
		"  reader(state.streamedSuggestionLength);",
		"  reader(state.streamedMarkdownSuggestionIds);",
		"  reader(state.lastStreamedMarkdownPreviewText);",
		"}",
		"",
	].join("\n");
	const dead = evaluateF22({
		forbiddenHits: [],
		writeSources: {
			[WRITE_FILES[0]]: deadLoop,
			[WRITE_FILES[1]]: "",
		},
	});
	if (
		!hasFailures(dead) ||
		dead.missingWrites.join(",") !== STREAMING_ACCUMULATORS.join(",")
	) {
		throw new Error(
			"F22: expected unread-after-init accumulators to fail the checker",
		);
	}

	const liveLoop = [
		"state.currentText += nextDelta;",
		"state.blockStreamingStarted = true;",
		"state.streamedSuggestionInitialized = true;",
		"state.streamedSuggestionLength += nextDelta.length;",
		"state.streamedMarkdownSuggestionIds = previewRefresh.suggestionIds;",
		"state.lastStreamedMarkdownPreviewText = previewRefresh.normalizedText;",
		"",
	].join("\n");
	const live = evaluateF22({
		forbiddenHits: [],
		writeSources: {
			[WRITE_FILES[0]]: liveLoop,
			[WRITE_FILES[1]]: "",
		},
	});
	if (hasFailures(live)) {
		throw new Error("F22: expected written accumulators to pass the checker");
	}

	const banned = evaluateF22({
		forbiddenHits,
		writeSources: {
			[WRITE_FILES[0]]: liveLoop,
			[WRITE_FILES[1]]: "",
		},
	});
	if (!hasFailures(banned) || banned.forbiddenHits.length !== 1) {
		throw new Error(
			"F22: expected hasWarnedAboutWithoutOption to fail the checker",
		);
	}
}

function offsetToLine(source, offset) {
	let line = 1;
	for (let i = 0; i < offset; i += 1) {
		if (source[i] === "\n") {
			line += 1;
		}
	}
	return line;
}

function toPosix(repoRoot, filePath) {
	return path.relative(repoRoot, filePath).split(path.sep).join(path.posix.sep);
}

async function walkFiles(rootDir, extensions) {
	const out = [];
	try {
		await fs.access(rootDir);
	} catch {
		return out;
	}
	async function visit(dir) {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORE_DIR_NAMES.has(entry.name)) {
					await visit(full);
				}
				continue;
			}
			if (entry.isFile() && extensions.has(path.extname(entry.name))) {
				out.push(full);
			}
		}
	}
	await visit(rootDir);
	return out;
}

export async function collectForbiddenHits(repoRoot) {
	const files = await walkFiles(path.join(repoRoot, "packages"), SOURCE_EXTENSIONS);
	if (files.length === 0) {
		throw new Error(
			"f22-dead-bindings: cannot check: packages *.{ts,tsx} walk matched 0 files",
		);
	}
	const hits = [];
	for (const filePath of files) {
		const source = await fs.readFile(filePath, "utf8");
		hits.push(...extractForbiddenHits(source, toPosix(repoRoot, filePath)));
	}
	hits.sort((left, right) => {
		const byFile = left.file.localeCompare(right.file);
		return byFile !== 0 ? byFile : left.line - right.line;
	});
	return { hits, fileCount: files.length };
}

export async function loadWriteSources(repoRoot) {
	const writeSources = {};
	for (const rel of WRITE_FILES) {
		try {
			writeSources[rel] = await fs.readFile(path.join(repoRoot, rel), "utf8");
		} catch (error) {
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
				continue;
			}
			throw error;
		}
	}
	return writeSources;
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
	runF22Fixture();
	console.log(
		"F22 fixture: dead accumulators and hasWarnedAboutWithoutOption in a temp string failed the checker.",
	);

	const args = parseArgs(process.argv.slice(2));
	const forbidden = await collectForbiddenHits(args.repoRoot);
	console.log(
		`population: ${forbidden.fileCount} files (packages *.{ts,tsx})`,
	);
	const result = evaluateF22({
		forbiddenHits: forbidden.hits,
		writeSources: await loadWriteSources(args.repoRoot),
	});
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
