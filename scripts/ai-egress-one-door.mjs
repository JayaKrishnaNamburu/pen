#!/usr/bin/env node
/**
 * One-door gate for ModelAdapter (AIB1).
 *
 * The only durable way to reach a model is ModelAdapter.stream, and the
 * only non-test call of that method is streamThroughEgress after
 * filterAIRequest. A second call site, or a second method on the
 * interface (generate, complete, …), is a door that would not pass
 * through pen.aiEgress.
 *
 * Keys on property-access calls: `.stream(`. That is the invocation
 * form. Method *definitions* (`async *stream(`, `stream(options`) have
 * no leading dot and are ignored.
 *
 * A hit counts only when the file mentions `ModelAdapter` or the call
 * argument mentions `messages` — the adapter request shape. That keeps
 * PenTransport.stream and other `.stream(` methods from matching.
 *
 * Does not catch: a renamed method used without `ModelAdapter` and
 * without `messages` nearby; a new adapter type that is not this
 * interface; `import { fetch }` / undici `request` as a side channel
 * (that is the suite network guard, not this script).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ADAPTER_FILE = "packages/types/src/types/tools.ts";
const EXPECTED_CALL_FILE = "packages/core/src/facets/aiEgressFacet.ts";
const EXPECTED_METHODS = ["stream"];

const SCAN_ROOTS = ["packages", "playground", "internal"];
const SKIP_DIRS = new Set([
	"node_modules",
	"dist",
	".turbo",
	"coverage",
	"build",
	".git",
	"playwright-report",
	"test-results",
]);
const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
]);

const STREAM_CALL_RE = /\.\s*stream\s*\(/g;

export function stripComments(source) {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function extractInterfaceBody(source, name) {
	const start = source.search(
		new RegExp(`(?:export\\s+)?interface\\s+${name}\\b`),
	);
	if (start < 0) {
		return null;
	}
	const brace = source.indexOf("{", start);
	if (brace < 0) {
		return null;
	}
	let depth = 0;
	for (let i = brace; i < source.length; i++) {
		const ch = source[i];
		if (ch === "{") {
			depth += 1;
		} else if (ch === "}") {
			depth -= 1;
			if (depth === 0) {
				return source.slice(brace + 1, i);
			}
		}
	}
	return null;
}

export function interfaceDoors(body) {
	const stripped = stripComments(body);
	const doors = [];
	let depth = 0;
	for (let i = 0; i < stripped.length; i++) {
		const ch = stripped[i];
		if (ch === "{" || ch === "(" || ch === "[") {
			depth += 1;
			continue;
		}
		if (ch === "}" || ch === ")" || ch === "]") {
			depth -= 1;
			continue;
		}
		if (depth !== 0) {
			continue;
		}
		if (!/[A-Za-z_]/.test(ch)) {
			continue;
		}
		const rest = stripped.slice(i);
		// stop before `(` so the loop can track paren depth through the signature
		const method = /^([A-Za-z_]\w*)\s*\??(?=\s*\()/.exec(rest);
		if (method) {
			doors.push(method[1]);
			i += method[0].length - 1;
			continue;
		}
		const fnProp = /^([A-Za-z_]\w*)\s*\??\s*:\s*(?=\()/.exec(rest);
		if (fnProp) {
			doors.push(fnProp[1]);
			i += fnProp[0].length - 1;
		}
	}
	return doors;
}

export function checkModelAdapterDoors(source, expected = EXPECTED_METHODS) {
	const body = extractInterfaceBody(source, "ModelAdapter");
	if (body == null) {
		return { ok: false, doors: [], violations: ["ModelAdapter interface not found"] };
	}
	const doors = interfaceDoors(body);
	const violations = [];
	if (doors.length !== expected.length || doors.some((name, i) => name !== expected[i])) {
		violations.push(
			`ModelAdapter doors are [${doors.join(", ")}]; expected [${expected.join(", ")}]`,
		);
	}
	return { ok: violations.length === 0, doors, violations };
}

function callMentionsMessages(source, index) {
	const window = source.slice(index, index + 240);
	return /\bmessages\b/.test(window);
}

export function findAdapterStreamCalls(source) {
	const stripped = stripComments(source);
	const mentionsAdapter = /\bModelAdapter\b/.test(stripped);
	const hits = [];
	STREAM_CALL_RE.lastIndex = 0;
	let match;
	while ((match = STREAM_CALL_RE.exec(stripped))) {
		if (!mentionsAdapter && !callMentionsMessages(stripped, match.index)) {
			continue;
		}
		const before = stripped.slice(0, match.index);
		const line = before.split("\n").length;
		hits.push({ line, text: stripped.split("\n")[line - 1].trim() });
	}
	return hits;
}

export function checkAdapterStreamCalls(files, expectedFile = EXPECTED_CALL_FILE) {
	const hits = [];
	for (const file of files) {
		for (const hit of findAdapterStreamCalls(file.content)) {
			hits.push({ file: file.file, ...hit });
		}
	}

	const violations = [];
	if (hits.length === 0) {
		violations.push(`no ModelAdapter.stream call sites; expected one in ${expectedFile}`);
	} else {
		for (const hit of hits) {
			if (hit.file !== expectedFile) {
				violations.push(
					`extra ModelAdapter.stream call in ${hit.file}:${hit.line} (${hit.text})`,
				);
			}
		}
		const expectedHits = hits.filter((hit) => hit.file === expectedFile);
		if (expectedHits.length === 0) {
			violations.push(`missing ModelAdapter.stream call in ${expectedFile}`);
		} else if (expectedHits.length > 1) {
			violations.push(
				`${expectedHits.length} ModelAdapter.stream calls in ${expectedFile}; expected 1`,
			);
		}
	}

	return { ok: violations.length === 0, hits, violations };
}

export function runCallSiteFixture() {
	const result = checkAdapterStreamCalls([
		{
			file: EXPECTED_CALL_FILE,
			content: "import type { ModelAdapter } from '@input/pen-types';\nmodel.stream({\n  messages: [],\n});\n",
		},
		{
			file: "packages/extensions/ai/src/bypass.ts",
			content: "import type { ModelAdapter } from '@input/pen-types';\ndeclare const model: ModelAdapter;\nvoid model.stream({ messages: [], tools: [] });\n",
		},
	]);
	if (
		result.ok ||
		!result.violations.some((line) => line.includes("packages/extensions/ai/src/bypass.ts"))
	) {
		throw new Error("expected a second ModelAdapter.stream call site to fail the checker");
	}
}

export function runExtraMethodFixture() {
	const source = `export interface ModelAdapter {
  capabilities?: { structuredIntent?: boolean };
  stream(options: { messages: unknown[] }): AsyncIterable<unknown>;
  generate(options: { messages: unknown[] }): Promise<unknown>;
}
`;
	const result = checkModelAdapterDoors(source);
	if (result.ok || !result.violations.some((line) => line.includes("generate"))) {
		throw new Error("expected ModelAdapter.generate to fail the checker");
	}
}

function isTestFile(relPath) {
	const parts = relPath.split(path.sep);
	if (parts.includes("__tests__")) {
		return true;
	}
	return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(parts[parts.length - 1]);
}

function collectSourceFiles(absDir, relDir, out) {
	let entries;
	try {
		entries = fs.readdirSync(absDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) {
			continue;
		}
		const absPath = path.join(absDir, entry.name);
		const relPath = path.join(relDir, entry.name);
		if (entry.isDirectory()) {
			collectSourceFiles(absPath, relPath, out);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			continue;
		}
		if (isTestFile(relPath)) {
			continue;
		}
		out.push(relPath.split(path.sep).join("/"));
	}
}

function loadRepoFiles() {
	const relPaths = [];
	for (const root of SCAN_ROOTS) {
		collectSourceFiles(path.join(repoRoot, root), root, relPaths);
	}
	relPaths.sort();
	return relPaths.map((file) => ({
		file,
		content: fs.readFileSync(path.join(repoRoot, file), "utf8"),
	}));
}

function main() {
	runCallSiteFixture();
	console.log("call-site fixture: second model.stream in a temp file failed the checker.");
	runExtraMethodFixture();
	console.log("extra-method fixture: ModelAdapter.generate failed the checker.");

	const files = loadRepoFiles();
	if (files.length === 0) {
		console.error(
			"ai-egress-one-door: cannot check: packages+playground+internal source walk matched 0 files",
		);
		process.exit(1);
	}
	console.log(
		`population: ${files.length} files (packages+playground+internal source, tests excluded)`,
	);
	const adapterFile = files.find((file) => file.file === ADAPTER_FILE);
	if (!adapterFile) {
		console.error(`ai-egress-one-door failed: missing ${ADAPTER_FILE}`);
		process.exit(1);
	}

	const doorResult = checkModelAdapterDoors(adapterFile.content);
	const callResult = checkAdapterStreamCalls(files);
	const violations = [...doorResult.violations, ...callResult.violations];
	if (violations.length > 0) {
		console.error("ai-egress-one-door failed:");
		for (const line of violations) {
			console.error(`  ${line}`);
		}
		process.exit(1);
	}

	console.log(
		`ai-egress-one-door ok — ModelAdapter methods [${doorResult.doors.join(", ")}], one call in ${EXPECTED_CALL_FILE}:${callResult.hits[0].line}.`,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main();
}
