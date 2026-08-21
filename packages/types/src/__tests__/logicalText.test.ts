import { describe, expect, it } from "vitest";
import { EMPTY_BLOCK_SENTINEL, logicalTextFromStored } from "../utils/logicalText";

describe("logicalTextFromStored (I11)", () => {
	it("reads the exact empty-block sentinel as empty logical text", () => {
		expect(logicalTextFromStored(EMPTY_BLOCK_SENTINEL)).toBe("");
	});

	it("leaves empty stored text empty", () => {
		expect(logicalTextFromStored("")).toBe("");
	});

	it("leaves ordinary stored text unchanged", () => {
		expect(logicalTextFromStored("hello")).toBe("hello");
	});

	it("does not strip a user-typed zero-width space inside non-empty text", () => {
		const stored = `hello${EMPTY_BLOCK_SENTINEL}world`;
		expect(logicalTextFromStored(stored)).toBe(stored);
	});
});
