import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import { createAutocompleteStructuredCandidate } from "../structuredCandidate";

describe("createAutocompleteStructuredCandidate", () => {
	it("uses single newlines for adjacent paragraph blocks", () => {
		const editor = createEditor();

		const candidate = createAutocompleteStructuredCandidate(
			editor,
			"Hey Oleksandr,\nHappy to set that up.\n- Krijn",
			{
				activeBlockType: "paragraph",
			},
		);

		expect(candidate.inlineText).toBe("Hey Oleksandr,");
		expect(candidate.appendedBlocks.map((block) => block.content ?? "")).toEqual([
			"Happy to set that up.",
			"- Krijn",
		]);

		editor.destroy();
	});

	it("preserves blank-line paragraph separators from double newlines", () => {
		const editor = createEditor();

		const candidate = createAutocompleteStructuredCandidate(
			editor,
			"Hey Oleksandr,\n\nHappy to set that up.\n\n- Krijn",
			{
				activeBlockType: "paragraph",
			},
		);

		expect(candidate.inlineText).toBe("Hey Oleksandr,");
		expect(candidate.appendedBlocks.map((block) => block.content ?? "")).toEqual([
			"",
			"Happy to set that up.",
			"",
			"- Krijn",
		]);

		editor.destroy();
	});

	it("uses trailing single newlines to leave the caret in a new empty block", () => {
		const editor = createEditor();

		const candidate = createAutocompleteStructuredCandidate(
			editor,
			"Hey Oleksandr,\n",
			{
				activeBlockType: "paragraph",
			},
		);

		expect(candidate.inlineText).toBe("Hey Oleksandr,");
		expect(candidate.appendedBlocks.map((block) => block.content ?? "")).toEqual([""]);

		editor.destroy();
	});

	it("uses trailing double newlines to preserve a spacer before the next insertion target", () => {
		const editor = createEditor();

		const candidate = createAutocompleteStructuredCandidate(
			editor,
			"Hey Oleksandr,\n\n",
			{
				activeBlockType: "paragraph",
			},
		);

		expect(candidate.inlineText).toBe("Hey Oleksandr,");
		expect(candidate.appendedBlocks.map((block) => block.content ?? "")).toEqual(["", ""]);

		editor.destroy();
	});

	it("uses leading single newlines to start appended blocks", () => {
		const editor = createEditor();

		const candidate = createAutocompleteStructuredCandidate(
			editor,
			"\nSure thing – I can share that repo.\n- Krijn",
			{
				activeBlockType: "paragraph",
			},
		);

		expect(candidate.inlineText).toBe("");
		expect(candidate.appendedBlocks.map((block) => block.content ?? "")).toEqual([
			"Sure thing – I can share that repo.",
			"- Krijn",
		]);

		editor.destroy();
	});

	it("uses leading double newlines to insert a spacer before appended blocks", () => {
		const editor = createEditor();

		const candidate = createAutocompleteStructuredCandidate(
			editor,
			"\n\nSure thing – I can share that repo.\n\n- Krijn",
			{
				activeBlockType: "paragraph",
			},
		);

		expect(candidate.inlineText).toBe("");
		expect(candidate.appendedBlocks.map((block) => block.content ?? "")).toEqual([
			"",
			"Sure thing – I can share that repo.",
			"",
			"- Krijn",
		]);

		editor.destroy();
	});

	it("keeps markdown list continuations structured", () => {
		const editor = createEditor();

		const candidate = createAutocompleteStructuredCandidate(
			editor,
			"\n- item one\n- item two",
			{
				activeBlockType: "paragraph",
			},
		);

		expect(candidate.inlineText).toBe("");
		expect(candidate.appendedBlocks.map((block) => block.type)).toEqual([
			"bulletListItem",
			"bulletListItem",
		]);
		expect(candidate.appendedBlocks.map((block) => block.content ?? "")).toEqual([
			"item one",
			"item two",
		]);

		editor.destroy();
	});
});
