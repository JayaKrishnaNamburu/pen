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
 * Producers must import the vocabulary instead of retyping the strings.
 * Sheet selectors and theme properties must interpolate it instead of
 * restating it. Every REVIEW_SURFACE_CLASSES name must have a rule in
 * the sheet (`spec/rules/ai.md` RS4).
 */

const AI_SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_PACKAGES = join(AI_SRC, "..", "..", "..");

const PRODUCER_ROOTS = [
	join(REPO_PACKAGES, "extensions", "ai", "src"),
	join(REPO_PACKAGES, "rendering", "dom", "src"),
	join(REPO_PACKAGES, "rendering", "react", "src"),
	join(REPO_PACKAGES, "rendering", "vue", "src"),
];

const VOCABULARY = [
	...Object.values(REVIEW_SURFACE_CLASSES),
	...Object.values(REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES),
];

/**
 * Matches a review class name written as a string literal. The vocabulary
 * module (in `@input/pen-types`, not walked here) and the stylesheet
 * interpolations are where these names are allowed to appear.
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
		for (const file of sourceFiles(PRODUCER_ROOTS)) {
			const contents = readFileSync(file, "utf8");
			const matches = contents.match(LITERAL_REVIEW_CLASS);
			if (matches) {
				offenders.push(
					`${relative(REPO_PACKAGES, file)}: ${[...new Set(matches)].join(", ")}`,
				);
			}
		}
		expect(
			offenders,
			"these files retype the vocabulary instead of importing it",
		).toEqual([]);
	});

	it("RS4: the exported sheet interpolates the vocabulary and the theme seam", () => {
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

		const literalSelectors = sheet.match(/^\.\s*pen-[a-z-]+/gm) ?? [];
		expect(
			literalSelectors,
			"sheet selectors must interpolate the vocabulary, not restate it",
		).toEqual([]);

		const bareProperties =
			sheet.match(/var\(--pen-ai-review-[a-z-]+/g) ?? [];
		expect(
			bareProperties,
			"sheet custom properties must interpolate REVIEW_SURFACE_CUSTOM_PROPERTIES, not restate them",
		).toEqual([]);

		const interpolatedClassKeys = [
			...new Set(
				[...sheet.matchAll(/REVIEW_SURFACE_CLASSES\.(\w+)/g)].map(
					(match) => match[1]!,
				),
			),
		].sort();
		expect(interpolatedClassKeys).toEqual(
			Object.keys(REVIEW_SURFACE_CLASSES).sort(),
		);

		const referencedKeys = [
			...new Set(
				[
					...sheet.matchAll(
						/REVIEW_SURFACE_CUSTOM_PROPERTIES\.(\w+)/g,
					),
				].map((match) => match[1]!),
			),
		].sort();
		const declaredKeys = Object.keys(
			REVIEW_SURFACE_CUSTOM_PROPERTIES,
		).sort();
		expect(referencedKeys).toEqual(declaredKeys);
	});
});

function sourceFiles(roots: readonly string[]): string[] {
	const found: string[] = [];
	const walk = (directory: string) => {
		for (const entry of readdirSync(directory)) {
			const path = join(directory, entry);
			if (statSync(path).isDirectory()) {
				if (
					entry === "__tests__" ||
					entry === "dist" ||
					entry === "node_modules"
				) {
					continue;
				}
				walk(path);
				continue;
			}
			if (entry === "reviewStylesheet.ts") continue;
			if (
				(path.endsWith(".ts") || path.endsWith(".tsx")) &&
				!path.endsWith(".test.ts") &&
				!path.endsWith(".test.tsx")
			) {
				found.push(path);
			}
		}
	};
	for (const root of roots) {
		walk(root);
	}
	return found;
}
