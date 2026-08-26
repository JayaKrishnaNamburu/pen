import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES,
	REVIEW_SURFACE_CLASSES,
	REVIEW_SURFACE_CUSTOM_PROPERTIES,
} from "@input/pen-types";

/**
 * RS4: one styling contract, exported once.
 *
 * The vocabulary is only a single source of truth if the producers read it
 * instead of retyping the strings, and the sheet is only a contract if its
 * selectors and the emitted classes are the same set. Both are checked against
 * the source, because a hardcoded class name is invisible at runtime — it
 * renders identically right up until someone renames the constant
 * (`spec-v5/02-review-surface.md` RS4).
 */

const AI_SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_PACKAGES = join(AI_SRC, "..", "..", "..");

const VOCABULARY = [
	...Object.values(REVIEW_SURFACE_CLASSES),
	...Object.values(REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES),
];

/**
 * Matches a review class name written as a string literal. The vocabulary
 * module and the stylesheet are where these names are allowed to appear.
 */
const LITERAL_REVIEW_CLASS =
	/["'`](?:pen-suggestion-|pen-ai-review-|pen-block-suggestion|pen-ai-affected-range)[a-z-]*/g;

describe("RS4: review class names resolve from one vocabulary", () => {
	it("RS4: the vocabulary is a closed set of distinct names", () => {
		expect(VOCABULARY.length).toBeGreaterThan(0);
		expect(new Set(VOCABULARY).size).toBe(VOCABULARY.length);
		for (const className of VOCABULARY) {
			expect(className).toMatch(/^pen-[a-z-]+$/);
		}
	});

	it("RS4: no producer hardcodes a review class name", () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(AI_SRC)) {
			const contents = readFileSync(file, "utf8");
			const matches = contents.match(LITERAL_REVIEW_CLASS);
			if (matches) {
				offenders.push(
					`${relative(AI_SRC, file)}: ${[...new Set(matches)].join(", ")}`,
				);
			}
		}
		expect(
			offenders,
			"these files retype the vocabulary instead of importing it",
		).toEqual([]);
	});

	it("RS4: the exported sheet styles only names the vocabulary declares", () => {
		const sheet = readFileSync(
			join(
				REPO_PACKAGES,
				"rendering",
				"dom",
				"src",
				"styles",
				"reviewStylesheet.ts",
			),
			"utf8",
		);

		// Selectors are interpolated from the constants, so the sheet must not
		// contain a bare `.pen-…` selector — that would be a name drifting free
		// of the vocabulary.
		const literalSelectors = sheet.match(/^\.\s*pen-[a-z-]+/gm) ?? [];
		expect(
			literalSelectors,
			"sheet selectors must interpolate the vocabulary, not restate it",
		).toEqual([]);

		// Every custom property the sheet reads is one hosts are told about.
		const referenced = [
			...new Set(
				[...sheet.matchAll(/var\((--pen-ai-review-[a-z-]+)/g)].map(
					(match) => match[1]!,
				),
			),
		].sort();
		const declared = new Set<string>(
			Object.values(REVIEW_SURFACE_CUSTOM_PROPERTIES),
		);
		expect(referenced.length).toBeGreaterThan(0);
		for (const property of referenced) {
			expect(
				declared.has(property),
				`sheet themes on "${property}", which the custom-property contract does not declare`,
			).toBe(true);
		}
	});
});

function sourceFiles(root: string): string[] {
	const found: string[] = [];
	const walk = (directory: string) => {
		for (const entry of readdirSync(directory)) {
			const path = join(directory, entry);
			if (statSync(path).isDirectory()) {
				if (entry === "__tests__") continue;
				walk(path);
				continue;
			}
			if (path.endsWith(".ts") && !path.endsWith(".test.ts")) {
				found.push(path);
			}
		}
	};
	walk(root);
	return found;
}
