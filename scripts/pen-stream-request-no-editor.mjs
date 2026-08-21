#!/usr/bin/env node
/**
 * AIB2 type gate: `PenStreamRequest` must not grow an `editor` field.
 *
 * An `editor` on the request (top-level or under `context`) would let a
 * feature hand the live document across the boundary, which defeats the
 * enumerable-and-bounded property the rest of AIB2 establishes. The
 * replacement is the explicit serializable subset (`docId`, `selection`,
 * `blockId`) already listed on `context`.
 *
 * This is a source grep of the `PenStreamRequest` interface body, not a
 * TypeScript type check. A compile-time `"editor" extends keyof …`
 * assertion is stronger and belongs in `pnpm typecheck` once the nested
 * field is actually gone. Today `packages/types/src/types/stream.ts`
 * still declares `context.editor?: unknown`.
 *
 * Does not catch: a structurally typed equivalent (`Record<string,
 * unknown>` used as the request, a variable assigned then passed, a
 * renamed field such as `editorInstance`, runtime `context.editor = …`
 * on a value typed as something else, or a second request type that
 * is not named `PenStreamRequest`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const STREAM_FILE = "packages/types/src/types/stream.ts";

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

export function propertyNames(body) {
	const stripped = stripComments(body);
	const names = [];
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
		if (!/[A-Za-z_]/.test(ch)) {
			continue;
		}
		const rest = stripped.slice(i);
		const prop = /^([A-Za-z_]\w*)\s*\??\s*:/.exec(rest);
		if (prop) {
			names.push({ name: prop[1], depth });
			i += prop[0].length - 1;
		}
	}
	return names;
}

export function checkPenStreamRequestHasNoEditor(source) {
	const body = extractInterfaceBody(source, "PenStreamRequest");
	if (body == null) {
		return {
			ok: false,
			names: [],
			violations: ["PenStreamRequest interface not found"],
		};
	}
	const names = propertyNames(body);
	const editors = names.filter((entry) => entry.name === "editor");
	const violations = editors.map(
		(entry) =>
			`PenStreamRequest declares editor at nested depth ${entry.depth}`,
	);
	return { ok: violations.length === 0, names, violations };
}

export function runNestedEditorFixture() {
	const source = `export interface PenStreamRequest {
  prompt: string;
  context?: {
    editor?: unknown;
    docId?: string;
  };
}
`;
	const result = checkPenStreamRequestHasNoEditor(source);
	if (
		result.ok ||
		!result.violations.some((line) => line.includes("nested depth 1"))
	) {
		throw new Error(
			"expected PenStreamRequest.context.editor to fail the checker",
		);
	}
}

export function runTopLevelEditorFixture() {
	const source = `export interface PenStreamRequest {
  prompt: string;
  editor?: unknown;
}
`;
	const result = checkPenStreamRequestHasNoEditor(source);
	if (
		result.ok ||
		!result.violations.some((line) => line.includes("nested depth 0"))
	) {
		throw new Error(
			"expected a top-level PenStreamRequest.editor to fail the checker",
		);
	}
}

export function runHealthyFixture() {
	const source = `export interface PenStreamRequest {
  prompt: string;
  context?: {
    docId?: string;
    selection?: unknown;
    blockId?: string;
  };
}
`;
	const result = checkPenStreamRequestHasNoEditor(source);
	if (!result.ok) {
		throw new Error(
			`expected a PenStreamRequest without editor to pass: ${result.violations.join("; ")}`,
		);
	}
}

function main() {
	runNestedEditorFixture();
	console.log(
		"nested-editor fixture: PenStreamRequest.context.editor failed the checker.",
	);
	runTopLevelEditorFixture();
	console.log(
		"top-level-editor fixture: PenStreamRequest.editor failed the checker.",
	);
	runHealthyFixture();
	console.log("healthy fixture: PenStreamRequest without editor passed.");

	const absPath = path.join(repoRoot, STREAM_FILE);
	if (!fs.existsSync(absPath)) {
		console.error(
			`pen-stream-request-no-editor failed: missing ${STREAM_FILE}`,
		);
		process.exit(1);
	}

	const source = fs.readFileSync(absPath, "utf8");
	const result = checkPenStreamRequestHasNoEditor(source);
	if (!result.ok) {
		console.error("pen-stream-request-no-editor failed:");
		for (const line of result.violations) {
			console.error(`  ${line} (${STREAM_FILE})`);
		}
		process.exit(1);
	}

	console.log(
		`pen-stream-request-no-editor ok — PenStreamRequest in ${STREAM_FILE} has no editor field.`,
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
	main();
}
