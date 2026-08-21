#!/usr/bin/env node
/**
 * Core command catalog drift (packages/core/src/commands/CATALOG.md).
 *
 * Both directions:
 * - every CATALOG.md command name exists as a defineCommand token
 * - every defineCommand token is a catalog row
 * - every catalogued-as-core name has a commandHandler registration
 * - every registered handler is catalogued as core
 * - catalogued-as-field-editor / not-yet-moved have tokens and no handler
 * - the Counts table matches the owner column
 *
 * Fails closed on a walker that finds nothing (empty commands/ dir,
 * missing CATALOG.md, or a glob that silently matches zero modules).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const COMMANDS_REL = path.join("packages", "core", "src", "commands");
const CATALOG_REL = path.join(COMMANDS_REL, "CATALOG.md");

const REQUIRED_MODULES = [
	"caret.ts",
	"text.ts",
	"structure.ts",
	"table.ts",
	"history.ts",
	"builtin.ts",
	"define.ts",
];

const CATALOG_SECTIONS = new Set([
	"Caret",
	"Text",
	"Structure",
	"Table",
	"History",
]);

const OWNERS = new Set(["core", "field-editor", "not-yet-moved"]);

const COMMAND_CELL_RE =
	/^\|\s*`((?:pen|table|history)\.[A-Za-z][A-Za-z0-9]*)`\s*\|/;
const OWNER_CELL_RE = /\|\s*(core|field-editor|not-yet-moved)\s*\|/;
const DEFINE_COMMAND_RE =
	/defineCommand(?:<[^>]*>)?\(\s*"((?:pen|table|history)\.[A-Za-z][A-Za-z0-9]*)"\s*,?\s*\)/g;
const DEFINE_BINDING_RE =
	/(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9]*)\s*=\s*defineCommand(?:<[^>]*>)?\(\s*"((?:pen|table|history)\.[A-Za-z][A-Za-z0-9]*)"\s*,?\s*\)/g;
const COMMAND_HANDLER_RE = /commandHandler\(\s*([A-Za-z_][A-Za-z0-9]*)\s*,/g;
const COUNT_ROW_RE =
	/^\|\s*(?:\*\*)?(core|field-editor|not-yet-moved|total(?:\s+\(frozen\))?)(?:\*\*)?\s*\|\s*(?:\*\*)?(\d+)(?:\*\*)?\s*\|/i;
const HEADING_RE = /^##\s+(.+?)\s*$/;

function toPosix(relPath) {
	return relPath.split(path.sep).join("/");
}

function isTestFile(fileName) {
	return (
		fileName.includes(".test.") ||
		fileName.includes(".spec.") ||
		fileName.endsWith(".snap")
	);
}

export function collectCommandModules(repoRoot) {
	const dir = path.join(repoRoot, COMMANDS_REL);
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const files = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".ts")) {
			continue;
		}
		if (isTestFile(entry.name)) {
			continue;
		}
		files.push(path.join(dir, entry.name));
	}
	files.sort();
	return files;
}

export function walkerCoverageError(modules, catalogPath, repoRoot) {
	if (modules.length === 0) {
		return `command-catalog-check: scanned 0 command modules under ${toPosix(COMMANDS_REL)} (walker/glob is broken; refusing to pass)`;
	}
	if (!fs.existsSync(catalogPath)) {
		return `command-catalog-check: missing ${toPosix(path.relative(repoRoot, catalogPath))}`;
	}
	const names = new Set(modules.map((filePath) => path.basename(filePath)));
	const missing = REQUIRED_MODULES.filter((name) => !names.has(name));
	if (missing.length > 0) {
		return `command-catalog-check: walker missed required modules: ${missing.join(", ")}`;
	}
	return null;
}

export function parseCatalog(source) {
	const rows = [];
	let section = null;
	let inCounts = false;
	const counts = {};

	for (const line of source.split(/\r?\n/)) {
		const heading = line.match(HEADING_RE);
		if (heading) {
			const title = heading[1].replace(/\s*\(.*\)\s*$/, "").trim();
			section = title;
			inCounts = title === "Counts";
			continue;
		}

		if (inCounts) {
			const count = line.match(COUNT_ROW_RE);
			if (count) {
				const key = count[1].toLowerCase().startsWith("total")
					? "total"
					: count[1];
				counts[key] = Number(count[2]);
			}
			continue;
		}

		const sectionName = section?.replace(/\s*`[^`]+`\s*$/, "").trim();
		if (!sectionName || !CATALOG_SECTIONS.has(sectionName.split(" ")[0])) {
			continue;
		}

		const command = line.match(COMMAND_CELL_RE);
		if (!command) {
			continue;
		}
		const owner = line.match(OWNER_CELL_RE);
		if (!owner) {
			throw new Error(
				`command-catalog-check: ${command[1]} has no owner column (core | field-editor | not-yet-moved)`,
			);
		}
		if (!OWNERS.has(owner[1])) {
			throw new Error(
				`command-catalog-check: ${command[1]} has unknown owner ${owner[1]}`,
			);
		}
		rows.push({ name: command[1], owner: owner[1], section: sectionName });
	}

	return { rows, counts };
}

export function parseCommandModule(source) {
	const tokens = [];
	const bindings = new Map();
	const handlers = [];

	for (const match of source.matchAll(DEFINE_COMMAND_RE)) {
		tokens.push(match[1]);
	}
	for (const match of source.matchAll(DEFINE_BINDING_RE)) {
		bindings.set(match[1], match[2]);
	}
	for (const match of source.matchAll(COMMAND_HANDLER_RE)) {
		const name = bindings.get(match[1]);
		if (!name) {
			throw new Error(
				`command-catalog-check: commandHandler(${match[1]}) has no defineCommand binding in the same file`,
			);
		}
		handlers.push(name);
	}

	return { tokens, handlers };
}

function uniqueSorted(values) {
	return [...new Set(values)].sort();
}

function diff(left, right) {
	return left.filter((name) => !right.has(name));
}

export function evaluateCatalog(catalog, modules) {
	const catalogNames = catalog.rows.map((row) => row.name);
	const catalogSet = new Set(catalogNames);
	const duplicates = catalogNames.filter(
		(name, index) => catalogNames.indexOf(name) !== index,
	);

	const tokenNames = [];
	const handlerNames = [];
	for (const module of modules) {
		tokenNames.push(...module.tokens);
		handlerNames.push(...module.handlers);
	}

	const tokenSet = new Set(tokenNames);
	const handlerSet = new Set(handlerNames);
	const coreCatalog = catalog.rows
		.filter((row) => row.owner === "core")
		.map((row) => row.name);
	const deferredCatalog = catalog.rows
		.filter((row) => row.owner !== "core")
		.map((row) => row.name);

	const ownerCounts = {
		core: coreCatalog.length,
		"field-editor": catalog.rows.filter((row) => row.owner === "field-editor")
			.length,
		"not-yet-moved": catalog.rows.filter(
			(row) => row.owner === "not-yet-moved",
		).length,
		total: catalog.rows.length,
	};

	const violations = [];

	if (duplicates.length > 0) {
		violations.push(
			`duplicate catalog rows: ${uniqueSorted(duplicates).join(", ")}`,
		);
	}

	const cataloguedMissingToken = diff(catalogNames, tokenSet);
	if (cataloguedMissingToken.length > 0) {
		violations.push(
			`catalogued but no defineCommand token: ${cataloguedMissingToken.join(", ")}`,
		);
	}

	const implementedUncatalogued = diff([...tokenSet], catalogSet);
	if (implementedUncatalogued.length > 0) {
		violations.push(
			`defineCommand token missing from CATALOG.md: ${implementedUncatalogued.join(", ")}`,
		);
	}

	const coreMissingHandler = diff(coreCatalog, handlerSet);
	if (coreMissingHandler.length > 0) {
		violations.push(
			`catalogued as core but no commandHandler: ${coreMissingHandler.join(", ")}`,
		);
	}

	const handlerNotCore = [...handlerSet].filter(
		(name) => !coreCatalog.includes(name),
	);
	if (handlerNotCore.length > 0) {
		violations.push(
			`registered handler not catalogued as core: ${uniqueSorted(handlerNotCore).join(", ")}`,
		);
	}

	const deferredWithHandler = deferredCatalog.filter((name) =>
		handlerSet.has(name),
	);
	if (deferredWithHandler.length > 0) {
		violations.push(
			`catalogued as deferred but has a commandHandler (move owner to core): ${deferredWithHandler.join(", ")}`,
		);
	}

	for (const key of ["core", "field-editor", "not-yet-moved", "total"]) {
		if (catalog.counts[key] !== ownerCounts[key]) {
			violations.push(
				`Counts table ${key}=${catalog.counts[key] ?? "missing"} but owner column is ${ownerCounts[key]}`,
			);
		}
	}

	return {
		ok: violations.length === 0,
		violations,
		ownerCounts,
		catalogNames: uniqueSorted(catalogNames),
		tokenNames: uniqueSorted(tokenNames),
		handlerNames: uniqueSorted(handlerNames),
	};
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTest() {
	const catalog = parseCatalog(`# Built-in command catalog

## Caret (\`caret.ts\`)

| Command | Param | Owner | Current name |
| --- | --- | --- | --- |
| \`pen.caretLeft\` | \`{ extend }\` | core | left |
| \`pen.caretUp\` | \`{ extend }\` | not-yet-moved | token only |

## Text (\`text.ts\`)

| Command | Param | Owner | Current name |
| --- | --- | --- | --- |
| \`pen.insertText\` | \`{ text }\` | core | insert |

## Counts

| Owner | Names |
| --- | --- |
| core | 2 |
| field-editor | 0 |
| not-yet-moved | 1 |
| **total (frozen)** | **3** |
`);

	assert(catalog.rows.length === 3, "self-test: expected 3 catalog rows");
	assert(
		catalog.rows[1]?.owner === "not-yet-moved",
		"self-test: caretUp owner must parse",
	);
	assert(catalog.counts.total === 3, "self-test: total count must parse");

	const matching = evaluateCatalog(catalog, [
		{
			tokens: ["pen.caretLeft", "pen.caretUp", "pen.insertText"],
			handlers: ["pen.caretLeft", "pen.insertText"],
		},
	]);
	assert(matching.ok, `self-test: matching fixture must pass: ${matching.violations.join("; ")}`);

	const extraToken = evaluateCatalog(catalog, [
		{
			tokens: ["pen.caretLeft", "pen.caretUp", "pen.insertText", "pen.caretPing"],
			handlers: ["pen.caretLeft", "pen.insertText", "pen.caretPing"],
		},
	]);
	assert(
		!extraToken.ok &&
			extraToken.violations.some((line) => line.includes("pen.caretPing")),
		"self-test: uncatalogued token must fail",
	);

	const missingHandler = evaluateCatalog(catalog, [
		{
			tokens: ["pen.caretLeft", "pen.caretUp", "pen.insertText"],
			handlers: ["pen.insertText"],
		},
	]);
	assert(
		!missingHandler.ok &&
			missingHandler.violations.some((line) =>
				line.includes("pen.caretLeft"),
			),
		"self-test: missing core handler must fail",
	);

	const emptyError = walkerCoverageError([], "/tmp/missing-catalog.md", DEFAULT_REPO_ROOT);
	assert(
		emptyError != null && emptyError.includes("scanned 0"),
		"self-test: zero scanned modules must fail closed",
	);

	const multiline = parseCommandModule(`
export const caretLineStart = defineCommand<CaretMotionParam>(
	"pen.caretLineStart",
);
export function caretCommandHandlers() {
	return [commandHandler(caretLineStart, handleLine)];
}
`);
	assert(
		multiline.tokens.includes("pen.caretLineStart") &&
			multiline.handlers.includes("pen.caretLineStart"),
		"self-test: multiline defineCommand with trailing comma must bind",
	);
}

function formatReport({ modules, result }) {
	const lines = [
		`command-catalog-check: scanned ${modules.length + 1} items (${modules.length} command modules + CATALOG.md), compared ${result.catalogNames.length} catalog rows / ${result.tokenNames.length} tokens / ${result.handlerNames.length} handlers`,
	];
	if (result.ok) {
		lines.push(
			`command-catalog-check ok (${result.ownerCounts.core} core, ${result.ownerCounts["field-editor"]} field-editor, ${result.ownerCounts["not-yet-moved"]} not-yet-moved, ${result.ownerCounts.total} total)`,
		);
		return lines.join("\n");
	}
	lines.push("command-catalog-check failed:");
	for (const violation of result.violations) {
		lines.push(`  ${violation}`);
	}
	return lines.join("\n");
}

function loadRepo(repoRoot) {
	const catalogPath = path.join(repoRoot, CATALOG_REL);
	const modules = collectCommandModules(repoRoot);
	const coverageError = walkerCoverageError(modules, catalogPath, repoRoot);
	if (coverageError) {
		return { coverageError, modules, catalogPath };
	}
	const catalog = parseCatalog(fs.readFileSync(catalogPath, "utf8"));
	const parsedModules = modules.map((filePath) => {
		const parsed = parseCommandModule(fs.readFileSync(filePath, "utf8"));
		return { filePath, ...parsed };
	});
	return { catalog, modules: parsedModules, catalogPath };
}

function main() {
	runSelfTest();
	console.log(
		"command-catalog-check self-test: uncatalogued token and missing core handler failed the checker.",
	);

	const repoRoot = DEFAULT_REPO_ROOT;
	const loaded = loadRepo(repoRoot);
	if (loaded.coverageError) {
		console.error(loaded.coverageError);
		process.exitCode = 1;
		return;
	}

	const result = evaluateCatalog(loaded.catalog, loaded.modules);
	const report = formatReport({
		modules: loaded.modules,
		result,
	});
	if (!result.ok) {
		console.error(report);
		process.exitCode = 1;
		return;
	}
	console.log(report);
}

const isDirectRun =
	process.argv[1] &&
	import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
