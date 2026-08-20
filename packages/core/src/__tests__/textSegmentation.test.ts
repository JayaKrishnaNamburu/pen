import { afterEach, describe, expect, it } from "vitest";

import {
	foldAndNormalize,
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
	wordRangeAt,
} from "../editor/textSegmentation";

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

describe("textSegmentation", () => {
	describe("graphemes (LOC4 / F2)", () => {
		it("LOC4 F2: previousGraphemeBoundary at an emoji deletes the whole grapheme, not a surrogate", () => {
			const text = "hi😀";

			expect(previousGraphemeBoundary(text, 4, "en")).toBe(2);
			expect(nextGraphemeBoundary(text, 2, "en")).toBe(4);
			expect(previousGraphemeBoundary(text, 3, "en")).toBe(2);
			expect(nextGraphemeBoundary(text, 3, "en")).toBe(4);
		});

		it("LOC4 F2: emoji ZWJ family is one grapheme", () => {
			const text = "a👨‍👩‍👧‍👦b";

			expect(nextGraphemeBoundary(text, 1, "en")).toBe(12);
			expect(previousGraphemeBoundary(text, 12, "en")).toBe(1);
			expect(previousGraphemeBoundary(text, 5, "en")).toBe(1);
			expect(nextGraphemeBoundary(text, 5, "en")).toBe(12);
		});

		it("LOC4 F2: combining marks stay with their base", () => {
			const text = "cafe\u0301s";

			expect(previousGraphemeBoundary(text, 5, "en")).toBe(3);
			expect(nextGraphemeBoundary(text, 3, "en")).toBe(5);
		});

		it("LOC4 F2: flag sequences are one grapheme", () => {
			const text = "hi🇯🇵x";

			expect(nextGraphemeBoundary(text, 2, "en")).toBe(6);
			expect(previousGraphemeBoundary(text, 6, "en")).toBe(2);
		});

		it("LOC4: grapheme boundaries clamp at the string edges", () => {
			expect(previousGraphemeBoundary("ab", 0, "en")).toBe(0);
			expect(nextGraphemeBoundary("ab", 2, "en")).toBe(2);
		});
	});

	describe("words (LOC4)", () => {
		it("LOC4: Japanese wordRangeAt isolates a word, not the clause", () => {
			const text = "今日は良い天気です";

			expect(wordRangeAt(text, 0, "ja")).toEqual({ start: 0, end: 2 });
			expect(wordRangeAt(text, 3, "ja")).toEqual({ start: 3, end: 5 });
			expect(nextWordBoundary(text, 0, "ja")).toBe(2);
			expect(previousWordBoundary(text, 3, "ja")).toBe(2);
		});

		it("LOC4: Thai wordRangeAt isolates a word, not the clause", () => {
			const text = "ฉันกินข้าว";

			expect(wordRangeAt(text, 0, "th")).toEqual({ start: 0, end: 3 });
			expect(wordRangeAt(text, 4, "th")).toEqual({ start: 3, end: 6 });
			expect(nextWordBoundary(text, 0, "th")).toBe(3);
		});

		it("LOC4: Arabic words split on the space, not per letter", () => {
			const text = "مرحبا بالعالم";

			expect(wordRangeAt(text, 1, "ar")).toEqual({ start: 0, end: 5 });
			expect(wordRangeAt(text, 8, "ar")).toEqual({ start: 6, end: 13 });
		});

		it("LOC4: Chinese words are shorter than the clause", () => {
			const text = "我喜欢这本书";

			expect(wordRangeAt(text, 1, "zh")).toEqual({ start: 1, end: 3 });
			expect(nextWordBoundary(text, 0, "zh")).toBe(1);
		});

		it("LOC4: Hebrew and Devanagari keep space-separated words", () => {
			expect(wordRangeAt("שלום עולם", 1, "he")).toEqual({
				start: 0,
				end: 4,
			});
			expect(wordRangeAt("नमस्ते दुनिया", 1, "hi")).toEqual({
				start: 0,
				end: 6,
			});
		});

		it("LOC4: English wordRangeAt and word motion share the same ranges", () => {
			const text = "hello world";

			expect(wordRangeAt(text, 2, "en")).toEqual({ start: 0, end: 5 });
			expect(wordRangeAt(text, 5, "en")).toEqual({ start: 0, end: 5 });
			expect(wordRangeAt(text, 6, "en")).toEqual({ start: 6, end: 11 });
			expect(previousWordBoundary(text, 6, "en")).toBe(0);
			expect(nextWordBoundary(text, 5, "en")).toBe(11);
			expect(wordRangeAt("   ", 1, "en")).toBeNull();
		});
	});

	describe("foldAndNormalize (LOC5)", () => {
		it("LOC5: Turkish ı and I fold to the same string", () => {
			expect(foldAndNormalize("I", "tr")).toBe(
				foldAndNormalize("ı", "tr"),
			);
			expect(foldAndNormalize("İ", "tr")).toBe(
				foldAndNormalize("i", "tr"),
			);
			expect(foldAndNormalize("I", "en")).not.toBe(
				foldAndNormalize("ı", "en"),
			);
		});

		it("LOC5: Greek final sigma folds to medial sigma", () => {
			expect(foldAndNormalize("Σ", "el")).toBe(
				foldAndNormalize("σ", "el"),
			);
			expect(foldAndNormalize("ς", "el")).toBe(
				foldAndNormalize("σ", "el"),
			);
		});

		it("LOC5: NFC makes composed and decomposed accents compare equal", () => {
			expect(foldAndNormalize("Café", "en")).toBe(
				foldAndNormalize("cafe\u0301", "en"),
			);
		});
	});

	describe("HOST4 Segmenter fallback", () => {
		it("HOST4 LOC4 F2: without Segmenter, character ops use code points, never code units", () => {
			deleteSegmenter();

			expect(previousGraphemeBoundary("hi😀", 4, "en")).toBe(2);
			expect(nextGraphemeBoundary("hi😀", 2, "en")).toBe(4);
			expect(previousGraphemeBoundary("hi😀", 3, "en")).toBe(2);
		});

		it("HOST4 LOC4: without Segmenter, combining marks and ZWJ degrade to code points", () => {
			deleteSegmenter();

			expect(previousGraphemeBoundary("cafe\u0301", 5, "en")).toBe(4);
			expect(nextGraphemeBoundary("👨‍👩‍👧‍👦", 0, "en")).toBe(2);
		});

		it("HOST4 LOC4: without Segmenter, word ops degrade to whitespace runs", () => {
			deleteSegmenter();

			expect(wordRangeAt("今日は良い天気です", 0, "ja")).toEqual({
				start: 0,
				end: 9,
			});
			expect(wordRangeAt("ฉันกินข้าว", 0, "th")).toEqual({
				start: 0,
				end: 10,
			});
			expect(wordRangeAt("hello world", 2, "en")).toEqual({
				start: 0,
				end: 5,
			});
			expect(nextWordBoundary("hello world", 5, "en")).toBe(11);
			expect(previousWordBoundary("hello world", 6, "en")).toBe(0);
		});
	});
});
