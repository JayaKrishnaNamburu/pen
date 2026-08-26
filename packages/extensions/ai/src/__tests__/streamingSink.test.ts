import { describe, expect, it } from "vitest";
import type { TextSelection } from "@input/pen-types";
import { resolveGenerationStreamingSink } from "../controller/streamingSink";

function textSelection(
	start: { blockId: string; offset: number },
	end: { blockId: string; offset: number } = start,
): TextSelection {
	return {
		type: "text",
		anchor: start,
		focus: end,
	};
}

describe("resolveGenerationStreamingSink", () => {
	it("names a direct block stream as write-now", () => {
		expect(
			resolveGenerationStreamingSink({
				target: { type: "block", blockId: "b1", offset: 0 },
				shouldStreamDirectly: true,
				contentFormat: "text",
				mutationMode: "direct-stream",
				editsArriveAsToolCalls: false,
				surface: undefined,
				selectionRange: null,
			}),
		).toEqual({ kind: "direct-write" });
	});

	it("names a same-block text rewrite as a suggestion splice", () => {
		expect(
			resolveGenerationStreamingSink({
				target: {
					type: "selection",
					selection: textSelection(
						{ blockId: "b1", offset: 0 },
						{ blockId: "b1", offset: 5 },
					),
				},
				shouldStreamDirectly: false,
				contentFormat: "text",
				mutationMode: "streaming-suggestions",
				editsArriveAsToolCalls: false,
				surface: undefined,
				selectionRange: {
					start: { blockId: "b1", offset: 0 },
					end: { blockId: "b1", offset: 5 },
				},
			}).kind,
		).toBe("suggestion-splice");
	});

	it("names a markdown block generation as a review preview", () => {
		expect(
			resolveGenerationStreamingSink({
				target: { type: "block", blockId: "b1", offset: 0 },
				shouldStreamDirectly: false,
				contentFormat: "markdown",
				mutationMode: "streaming-suggestions",
				editsArriveAsToolCalls: false,
				surface: "bottom-chat",
				selectionRange: null,
			}),
		).toEqual({
			kind: "review-preview",
			format: "markdown",
			source: "markdown-block",
			blockId: "b1",
			offset: 0,
			replaceTargetBlock: false,
			replaceBlockIds: undefined,
		});
	});

	it("names a cross-block selection rewrite as a review preview", () => {
		expect(
			resolveGenerationStreamingSink({
				target: {
					type: "selection",
					selection: textSelection(
						{ blockId: "b1", offset: 2 },
						{ blockId: "b2", offset: 3 },
					),
				},
				shouldStreamDirectly: false,
				contentFormat: "text",
				mutationMode: "streaming-suggestions",
				editsArriveAsToolCalls: false,
				surface: undefined,
				selectionRange: {
					start: { blockId: "b1", offset: 2 },
					end: { blockId: "b2", offset: 3 },
				},
			}),
		).toEqual({
			kind: "review-preview",
			format: "plain",
			source: "selection",
			range: {
				start: { blockId: "b1", offset: 2 },
				end: { blockId: "b2", offset: 3 },
			},
		});
	});

	it("does not preview tool-loop talk as a rewrite", () => {
		expect(
			resolveGenerationStreamingSink({
				target: {
					type: "selection",
					selection: textSelection(
						{ blockId: "b1", offset: 0 },
						{ blockId: "b1", offset: 5 },
					),
				},
				shouldStreamDirectly: false,
				contentFormat: "text",
				mutationMode: "streaming-suggestions",
				editsArriveAsToolCalls: true,
				surface: "bottom-chat",
				selectionRange: {
					start: { blockId: "b1", offset: 0 },
					end: { blockId: "b1", offset: 5 },
				},
			}),
		).toEqual({ kind: "none" });
	});

	it("buffers a block that is not a live write, splice, or markdown preview", () => {
		expect(
			resolveGenerationStreamingSink({
				target: { type: "block", blockId: "b1", offset: 0 },
				shouldStreamDirectly: false,
				contentFormat: "markdown",
				mutationMode: "persistent-suggestions",
				editsArriveAsToolCalls: false,
				surface: undefined,
				selectionRange: null,
			}),
		).toEqual({ kind: "buffered-commit" });
	});
});
