import { describe, expect, it } from "vitest";

import { DEFAULT_MESSAGE_CATALOG, type MessageKey } from "../types/messages";

const SPEC_KEYS = [
	"pen.selection.blocksSelected",
	"pen.ai.review.accept",
] as const satisfies readonly MessageKey[];

describe("message catalog (LOC1)", () => {
	it("LOC1: DEFAULT_MESSAGE_CATALOG is data — every key is namespaced and not the raw key", () => {
		const keys = Object.keys(DEFAULT_MESSAGE_CATALOG);
		expect(keys.length).toBeGreaterThan(0);

		for (const key of keys) {
			expect(key.startsWith("pen.")).toBe(true);
			expect(key.slice("pen.".length)).toContain(".");

			const value = DEFAULT_MESSAGE_CATALOG[key as MessageKey];
			const text = typeof value === "string" ? value : value.other;
			expect(text.length).toBeGreaterThan(0);
			expect(text).not.toBe(key);
		}

		for (const key of SPEC_KEYS) {
			expect(keys).toContain(key);
		}
	});
});
