import { describe, expect, it } from "vitest";
import { logicalLength, toDomOffset, toLogicalOffset } from "../offsetDomain";

function expectInvertible(text: string): void {
	const logicalEnd = logicalLength(text);
	for (let logical = 0; logical <= logicalEnd; logical++) {
		expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(logical);
	}

	for (let dom = 0; dom <= text.length; dom++) {
		const logical = toLogicalOffset(dom, text);
		expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(logical);
	}
}

describe("offsetDomain EM5", () => {
	it("EM5: empty string has logical length 0 and maps invertibly", () => {
		expect(logicalLength("")).toBe(0);
		expect(toDomOffset(0, "")).toBe(0);
		expect(toLogicalOffset(0, "")).toBe(0);
		expect(toLogicalOffset(1, "")).toBe(0);
		expectInvertible("");
	});

	it("EM5: normal text maps invertibly", () => {
		const text = "hello";
		expect(logicalLength(text)).toBe(5);
		expect(toDomOffset(0, text)).toBe(0);
		expect(toDomOffset(5, text)).toBe(5);
		expect(toLogicalOffset(2, text)).toBe(2);
		expectInvertible(text);
	});

	it("EM5: emoji uses UTF-16 offsets; mid-string ZWSP is length 1", () => {
		const text = "hi 👍";
		expect(text.length).toBe(5);
		expect(logicalLength(text)).toBe(5);
		expect(toDomOffset(3, text)).toBe(3);
		expect(toLogicalOffset(5, text)).toBe(5);
		expectInvertible(text);

		const withZwsp = "a\u200Bb";
		expect(logicalLength(withZwsp)).toBe(3);
		expectInvertible(withZwsp);
	});
});
