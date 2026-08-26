import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { computeBidiRuns } from "../levels";
import { BIDI_VECTORS } from "./vectors";

const MIXED = "Hello مرحبا";
const originalSegmenter = Intl.Segmenter;

afterEach(() => {
	Object.defineProperty(Intl, "Segmenter", {
		value: originalSegmenter,
		configurable: true,
		writable: true,
		enumerable: true,
	});
});

function deleteSegmenter(): void {
	delete (Intl as unknown as { Segmenter?: unknown }).Segmenter;
}

describe("BR3 computeBidiRuns cache contract", () => {
	it("BR3: same text and base are stable so a G2 cache key is valid", () => {
		const first = computeBidiRuns(MIXED, "ltr");
		const second = computeBidiRuns(MIXED, "ltr");
		expect(first).toEqual([
			{ from: 0, to: 6, level: 0 },
			{ from: 6, to: 11, level: 1 },
		]);
		expect(second).toEqual(first);
		expect(computeBidiRuns(MIXED, "rtl")).not.toEqual(first);
		expect(computeBidiRuns("Hello", "ltr")).not.toEqual(first);
	});

	it("BR3: computeBidiRuns stays stateless — geometry owns the cache", () => {
		const first = computeBidiRuns(MIXED, "ltr");
		const second = computeBidiRuns(MIXED, "ltr");
		expect(second).toEqual(first);
		expect(second).not.toBe(first);
		expect(computeBidiRuns("", "ltr")).not.toBe(computeBidiRuns("", "ltr"));
	});
});

describe("BR4 in-tree computeBidiRuns", () => {
	it("BR4: levels.ts is in-tree and does not import a bidi library or Intl.Segmenter", () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const source = readFileSync(join(here, "../levels.ts"), "utf8");
		const pkg = JSON.parse(
			readFileSync(join(here, "../../../package.json"), "utf8"),
		) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const depNames = [
			...Object.keys(pkg.dependencies ?? {}),
			...Object.keys(pkg.devDependencies ?? {}),
		];

		expect(source).not.toMatch(/^\s*import\s/m);
		expect(source).not.toContain("require(");
		expect(source).not.toContain("Intl.Segmenter");
		expect(depNames.some((name) => /bidi|fribidi/i.test(name))).toBe(false);
	});

	it("BR4: the vector suite still matches when Intl.Segmenter is absent", () => {
		deleteSegmenter();
		expect(Intl.Segmenter).toBeUndefined();

		for (const vector of BIDI_VECTORS) {
			expect(
				computeBidiRuns(vector.text, vector.base),
				vector.id,
			).toEqual(vector.runs);
		}
	});
});
