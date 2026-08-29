import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES,
	REVIEW_SURFACE_CLASSES,
	REVIEW_SURFACE_CUSTOM_PROPERTIES,
} from "@input/pen-types";
import {
	REVIEW_SURFACE_CLASSES as REVIEW_SURFACE_CLASSES_FROM_AI,
	REVIEW_SURFACE_CUSTOM_PROPERTIES as REVIEW_SURFACE_CUSTOM_PROPERTIES_FROM_AI,
} from "../index";

/**
 * RS4: one styling contract, exported once.
 *
 * Sheet selectors and theme properties must interpolate the vocabulary
 * instead of restating it, and every REVIEW_SURFACE_CLASSES name must have
 * a rule in the sheet (`spec/rules/ai.md` RS4).
 */

const AI_SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_PACKAGES = join(AI_SRC, "..", "..", "..");

const VOCABULARY = [
	...Object.values(REVIEW_SURFACE_CLASSES),
	...Object.values(REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES),
];

describe("RS4: review class names resolve from one vocabulary", () => {
	it("RS4: pen-ai re-exports the class and theme vocabulary from types", () => {
		expect(REVIEW_SURFACE_CLASSES_FROM_AI).toBe(REVIEW_SURFACE_CLASSES);
		expect(REVIEW_SURFACE_CUSTOM_PROPERTIES_FROM_AI).toBe(
			REVIEW_SURFACE_CUSTOM_PROPERTIES,
		);
	});

	it("RS4: the vocabulary is a closed set of distinct names", () => {
		expect(VOCABULARY.length).toBeGreaterThan(0);
		expect(new Set(VOCABULARY).size).toBe(VOCABULARY.length);
		for (const className of VOCABULARY) {
			expect(className).toMatch(/^pen-[a-z-]+$/);
		}
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
