import { describe, expect, it } from "vitest";
import { logicalLength, toDomOffset, toLogicalOffset } from "../offsetDomain";

const EMPTY_BLOCK_SENTINEL = "\u200B";

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

describe("offsetDomain I11 S2-seam", () => {
	it("I11 S2-seam: empty-block sentinel has logical length 0 and maps invertibly", () => {
		expect(logicalLength(EMPTY_BLOCK_SENTINEL)).toBe(0);
		expect(toDomOffset(0, EMPTY_BLOCK_SENTINEL)).toBe(0);
		expect(toLogicalOffset(0, EMPTY_BLOCK_SENTINEL)).toBe(0);
		expect(toLogicalOffset(1, EMPTY_BLOCK_SENTINEL)).toBe(0);
		expectInvertible(EMPTY_BLOCK_SENTINEL);
	});

	it("I11 S2-seam: normal text maps invertibly without a sentinel", () => {
		const text = "hello";
		expect(logicalLength(text)).toBe(5);
		expect(toDomOffset(0, text)).toBe(0);
		expect(toDomOffset(5, text)).toBe(5);
		expect(toLogicalOffset(2, text)).toBe(2);
		expectInvertible(text);
	});

	it("I11 S2-seam: emoji uses UTF-16 offsets and ignores the empty-block sentinel", () => {
		const text = "hi 👍";
		expect(text.length).toBe(5);
		expect(logicalLength(text)).toBe(5);
		expect(toDomOffset(3, text)).toBe(3);
		expect(toLogicalOffset(5, text)).toBe(5);
		expectInvertible(text);
	});
});
