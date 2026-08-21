import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export const PEN_DOCUMENT_SOURCE_REL = "src/types/crdt.ts";

/**
 * Reads `PenDocument` from `@input/pen-types` source, not from `dist`.
 * Package typecheck resolves the published declarations; turbo typecheck
 * does not rebuild them (`dependsOn: ["^typecheck"]`). A list pinned
 * only through `keyof PenDocument` stays green against a stale `.d.ts`
 * after the source grows.
 */
export function penDocumentSourcePath(): string {
	return join(
		dirname(require.resolve("@input/pen-types")),
		"..",
		PEN_DOCUMENT_SOURCE_REL,
	);
}

export function parsePenDocumentKeys(source: string): string[] | null {
	const start = source.indexOf("export interface PenDocument");
	if (start < 0) {
		return null;
	}
	const open = source.indexOf("{", start);
	if (open < 0) {
		return null;
	}
	let depth = 0;
	let end = -1;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (ch === "{") {
			depth += 1;
		} else if (ch === "}") {
			depth -= 1;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	if (end < 0) {
		return null;
	}
	const body = source.slice(open + 1, end);
	const keys = [
		...body.matchAll(
			/^\s+(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[?]?\s*:/gm,
		),
	].map((match) => match[1]);
	return keys.length > 0 ? keys : null;
}

export function readPenDocumentKeys(): string[] | null {
	return parsePenDocumentKeys(readFileSync(penDocumentSourcePath(), "utf8"));
}
