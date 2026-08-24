import { describe, expect, it } from "vitest";
import {
	logicalLength,
	toDomOffset,
	toLogicalOffset,
} from "../field-editor/offsetDomain";

const STORAGE_SAMPLES = [
	"",
	"\u200B",
	"\u200B\u200B",
	"a\u200Bb",
	"hello",
	" ",
	"hi 👍",
	"日本語",
] as const;

describe("offsetDomain I11", () => {
	it("I11 EM5: empty string is length 0; mid-string ZWSP is real; clamps invert", () => {
		for (const text of STORAGE_SAMPLES) {
			expect(logicalLength(text)).toBe(text.length);

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
