import { describe, expect, it } from "vitest";

import {
	compileReplacementSuggestionOps,
	tokenizeText,
} from "../textDiffEngine";

function hasWordSegmenter(): boolean {
	return typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";
}

describe("tokenizeText (LOC4)", () => {
	it("LOC4: Thai and Japanese clauses are not one word when the segmenter splits them", () => {
		const japanese = "今日は良い天気です";
		const thai = "ฉันกินข้าว";
		const japaneseTokens = tokenizeText(japanese, "ja");
		const thaiTokens = tokenizeText(thai, "th");

		if (!hasWordSegmenter()) {
			expect(japaneseTokens).toEqual([
				{ text: japanese, start: 0, end: japanese.length },
			]);
			expect(thaiTokens).toEqual([
				{ text: thai, start: 0, end: thai.length },
			]);
			return;
		}

		expect(japaneseTokens.map((token) => token.text)).toEqual([
			"今日",
			"は",
			"良い",
			"天気",
			"です",
		]);
		expect(thaiTokens.map((token) => token.text)).toEqual([
			"ฉัน",
			"กิน",
			"ข้าว",
		]);
		expect(japaneseTokens.some((token) => token.text === japanese)).toBe(
			false,
		);
		expect(thaiTokens.some((token) => token.text === thai)).toBe(false);
	});
});

describe("compileReplacementSuggestionOps (LOC4)", () => {
	it("LOC4: a Japanese word swap stays word-level when the segmenter splits the clause", () => {
		if (!hasWordSegmenter()) {
			return;
		}

		expect(
			compileReplacementSuggestionOps({
				blockId: "body-1",
				offset: 0,
				originalText: "今日は良い天気です",
				replacementText: "今日は悪い天気です",
				locale: "ja",
			}),
		).toEqual([
			{ type: "splice-text", blockId: "body-1", from: 3,
				to: 3 + 2 , insert: "" },
			{
				type: "splice-text",
				blockId: "body-1",
				from: 5,
				to: 5,
				insert: "悪い",
			},
		]);
	});
});
