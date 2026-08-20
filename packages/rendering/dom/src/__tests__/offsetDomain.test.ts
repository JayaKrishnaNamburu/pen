import { describe, expect, it } from "vitest";
import {
	logicalLength,
	toDomOffset,
	toLogicalOffset,
} from "../field-editor/offsetDomain";

const EMPTY_BLOCK_SENTINEL = "\u200B";

const STORAGE_SAMPLES = [
	"",
	EMPTY_BLOCK_SENTINEL,
	`${EMPTY_BLOCK_SENTINEL}${EMPTY_BLOCK_SENTINEL}`,
	`a${EMPTY_BLOCK_SENTINEL}b`,
	"hello",
	" ",
	"hi 👍",
	"日本語",
] as const;

describe("offsetDomain I11", () => {
	it("I11: empty-block sentinel is storage not logical; toDomOffset/toLogicalOffset invert on a sample of storage strings", () => {
		for (const text of STORAGE_SAMPLES) {
			const isEmptyBlockStorage = text === EMPTY_BLOCK_SENTINEL;
			expect(logicalLength(text)).toBe(isEmptyBlockStorage ? 0 : text.length);

			const logicalEnd = logicalLength(text);
			for (let logical = 0; logical <= logicalEnd; logical++) {
				expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(logical);
			}

			for (let dom = 0; dom <= text.length; dom++) {
				const logical = toLogicalOffset(dom, text);
				expect(logical).toBeGreaterThanOrEqual(0);
				expect(logical).toBeLessThanOrEqual(logicalEnd);
				expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(logical);
			}

			expect(toDomOffset(-1, text)).toBe(0);
			expect(toLogicalOffset(-5, text)).toBe(0);
			expect(toDomOffset(text.length + 10, text)).toBe(logicalEnd);
			expect(toLogicalOffset(text.length + 10, text)).toBe(logicalEnd);
		}
	});
});
