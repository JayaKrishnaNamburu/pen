import { describe, expect, it } from "vitest";
import {
	compileRangeReplacementSuggestionOps,
	compileReplacementSuggestionOps,
} from "../suggestions/textDiffOperations";

describe("compileReplacementSuggestionOps", () => {
	it("emits a word-level replacement for a single changed word", () => {
		expect(
			compileReplacementSuggestionOps({
				blockId: "body-1",
				offset: 0,
				originalText: "Thanks for joining us",
				replacementText: "Thanks for meeting us",
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 11,
				to: 11 + 7,
				insert: "",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 18,
				to: 18,
				insert: "meeting",
			},
		]);
	});

	it("emits phrase insertions without touching unchanged words", () => {
		expect(
			compileReplacementSuggestionOps({
				blockId: "body-1",
				offset: 4,
				originalText: "Sounds good",
				replacementText: "Sounds really good",
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 11,
				to: 11,
				insert: "really ",
			},
		]);
	});

	it("emits phrase deletions without replacing the whole sentence", () => {
		expect(
			compileReplacementSuggestionOps({
				blockId: "body-1",
				offset: 0,
				originalText: "Sounds really good",
				replacementText: "Sounds good",
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 7,
				to: 7 + 7,
				insert: "",
			},
		]);
	});

	it("keeps punctuation changes precise", () => {
		expect(
			compileReplacementSuggestionOps({
				blockId: "body-1",
				offset: 0,
				originalText: "I can make it.",
				replacementText: "I can't make it.",
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 2,
				to: 2 + 3,
				insert: "",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 5,
				to: 5,
				insert: "can't",
			},
		]);
	});

	it("falls back to a coarse replace when the token window is too large", () => {
		expect(
			compileReplacementSuggestionOps({
				blockId: "body-1",
				offset: 3,
				originalText: "one two three",
				replacementText: "four five six",
				maxDiffCells: 1,
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 3,
				to: 3 + 13,
				insert: "four five six",
			},
		]);
	});

	it("falls back to a coarse replace when a long rewrite would produce noisy hunks", () => {
		const originalText =
			"I will set yet that up - I will spin up private repo on our side and share access so you can pull it straight into your internal toolingtools.";
		const replacementText =
			"I will set up a private repo for you and grant access so you can pull it directly into your internal tooling.";

		expect(
			compileReplacementSuggestionOps({
				blockId: "body-1",
				offset: 0,
				originalText,
				replacementText,
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 0,
				to: 0 + originalText.length,
				insert: replacementText,
			},
		]);
	});

	it("keeps single-word changes precise inside multiline selected text", () => {
		const originalText = [
			"Hey Oleksandr,",
			"",
			"Sure thing— I'll have a MacBook ready for you, but feel free to bring your own setup if you prefer. See you a bit earlier, and let me know if you need anything else before then.",
			"",
			"- Krijn",
		].join("\n");
		const replacementText = originalText.replace(
			"MacBook ready",
			"MacBook Pro ready",
		);

		expect(
			compileReplacementSuggestionOps({
				blockId: "body-1",
				offset: 0,
				originalText,
				replacementText,
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: originalText.indexOf("ready"),
				to: originalText.indexOf("ready"),
				insert: "Pro ",
			},
		]);
	});
});

describe("compileRangeReplacementSuggestionOps", () => {
	it("splits newline-separated replacements into inserted paragraph blocks", () => {
		let nextBlockIndex = 0;
		expect(
			compileRangeReplacementSuggestionOps({
				blocks: [{ id: "body-1", text: "Hello old text" }],
				createBlockId: () => `new-block-${(nextBlockIndex += 1)}`,
				range: {
					start: { blockId: "body-1", offset: 6 },
					end: { blockId: "body-1", offset: 14 },
				},
				replacementText: "first paragraph\n\nsecond paragraph",
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 10,
				to: 10 + 4,
				insert: "",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 14,
				to: 14,
				insert: "paragraph",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 6,
				to: 6 + 3,
				insert: "",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 9,
				to: 9,
				insert: "first",
			},
			{
				type: "insert-block",
				blockId: "new-block-1",
				blockType: "paragraph",
				props: {},
				position: { after: "body-1" },
			},
			{
				type: "insert-block",
				blockId: "new-block-2",
				blockType: "paragraph",
				props: {},
				position: { after: "new-block-1" },
			},
			{
				type: "splice-text",
				blockId: "new-block-2",
				from: 0,
				to: 0,
				insert: "second paragraph",
			},
		]);
	});

	it("preserves the end-block suffix for multi-block replacements", () => {
		let nextBlockIndex = 0;
		expect(
			compileRangeReplacementSuggestionOps({
				blocks: [
					{ id: "body-1", text: "Start selected" },
					{ id: "body-2", text: "remove me" },
					{ id: "body-3", text: "selection end" },
				],
				createBlockId: () => `new-block-${(nextBlockIndex += 1)}`,
				range: {
					start: { blockId: "body-1", offset: 6 },
					end: { blockId: "body-3", offset: 9 },
				},
				replacementText: "First\nSecond",
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 6,
				to: 6 + 8,
				insert: "",
			},
			{
				type: "splice-text",
				blockId: "body-3",
				from: 0,
				to: 0 + 9,
				insert: "",
			},
			{ type: "delete-block", blockId: "body-2" },
			{
				type: "splice-text",
				blockId: "body-1",
				from: 6,
				to: 6,
				insert: "First",
			},
			{
				type: "insert-block",
				blockId: "new-block-1",
				blockType: "paragraph",
				props: {},
				position: { after: "body-1" },
			},
			{
				type: "splice-text",
				blockId: "new-block-1",
				from: 0,
				to: 0,
				insert: "Second",
			},
			{
				type: "splice-text",
				blockId: "new-block-1",
				from: 6,
				to: 6,
				insert: " end",
			},
			{ type: "delete-block", blockId: "body-3" },
		]);
	});

	it("keeps same-paragraph multi-block replacements word-level", () => {
		expect(
			compileRangeReplacementSuggestionOps({
				blocks: [
					{ id: "body-1", text: "Thanks for joining us" },
					{ id: "body-2", text: "I can meet tomorrow" },
				],
				range: {
					start: { blockId: "body-1", offset: 0 },
					end: {
						blockId: "body-2",
						offset: "I can meet tomorrow".length,
					},
				},
				replacementText: "Thanks for meeting us\nI can meet tomorrow",
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 11,
				to: 11 + 7,
				insert: "",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 18,
				to: 18,
				insert: "meeting",
			},
		]);
	});

	it("normalizes reverse ranges before compiling replacements", () => {
		expect(
			compileRangeReplacementSuggestionOps({
				blocks: [{ id: "body-1", text: "Make this better" }],
				range: {
					start: { blockId: "body-1", offset: 16 },
					end: { blockId: "body-1", offset: 5 },
				},
				replacementText: "that stronger",
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: 10,
				to: 10 + 6,
				insert: "",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 16,
				to: 16,
				insert: "stronger",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 5,
				to: 5 + 4,
				insert: "",
			},
			{
				type: "splice-text",
				blockId: "body-1",
				from: 9,
				to: 9,
				insert: "that",
			},
		]);
	});

	it("does not split same-block multiline replacements when only one word changes", () => {
		const originalText = [
			"Hey Oleksandr,",
			"",
			"Sure thing— I'll have a MacBook ready for you, but feel free to bring your own setup if you prefer.",
			"",
			"- Krijn",
		].join("\n");
		const replacementText = originalText.replace(
			"MacBook ready",
			"MacBook Pro ready",
		);

		expect(
			compileRangeReplacementSuggestionOps({
				blocks: [{ id: "body-1", text: originalText }],
				range: {
					start: { blockId: "body-1", offset: 0 },
					end: { blockId: "body-1", offset: originalText.length },
				},
				replacementText,
			}),
		).toEqual([
			{
				type: "splice-text",
				blockId: "body-1",
				from: originalText.indexOf("ready"),
				to: originalText.indexOf("ready"),
				insert: "Pro ",
			},
		]);
	});
});
