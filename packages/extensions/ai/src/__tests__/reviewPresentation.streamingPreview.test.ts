import { describe, expect, it } from "vitest";
import {
	buildAIReviewPresentationDecorations,
	buildStreamingReviewPreviewDecorations,
} from "../review/reviewPresentation";
import {
	buildMacBookProStreamingPreviewText,
	createAlphaBetaFriendReviewEditor,
	createAlphaBetaGammaReviewEditor,
	createHelloExclamationSuggestionEditor,
	createInlineSession,
	createMacBookThreeBlockReviewEditor,
	createReviewEditor,
	HI_TEXT_RANGE_STREAMING_PREVIEW,
	MACBOOK_REPLACEMENT_ORIGINAL_TEXT,
	MACBOOK_REPLACEMENT_PARAGRAPH_TEXT,
	MACBOOK_THREE_BLOCK_PARTS,
	readDecorationAttributes,
	readVirtualText,
} from "./reviewPresentation.testHelpers";

describe("AI review presentation streaming preview", () => {
	it("builds virtual final-text preview decorations without suggestion ids", () => {
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createReviewEditor({
				blockId: "body-1",
				text: "Hello",
				deltas: [{ insert: "Hello" }],
			}),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "text-range",
					blockId: "body-1",
					from: 0,
					to: 5,
				},
				text: "Hello world",
				previousTextLength: 5,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(decorations).toHaveLength(6);
		expect(decorations[0]).toMatchObject({
			blockId: "body-1",
			from: 5,
			key: "ai-streaming-review-preview:session-1:turn-1:2:new:body-1:5:5",
			virtualText: " ",
			attributes: {
				"data-pen-ai-review-preview-virtual": true,
				"data-pen-ai-review-preview-new": true,
				"data-pen-ai-preview-revision": 2,
			},
		});
		expect(
			String(readDecorationAttributes(decorations[1])?.style),
		).toContain("animation-delay: 4ms");
		expect(
			readDecorationAttributes(decorations[0])?.["data-suggestion-id"],
		).toBe(undefined);
	});

	it("animates only newly received insertion characters", () => {
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createReviewEditor({
				blockId: "body-1",
				text: "Hello",
				deltas: [{ insert: "Hello" }],
			}),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "insertion-point",
					blockId: "body-1",
					offset: 5,
				},
				text: " world",
				previousTextLength: 3,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});
		const newDecorations = decorations.filter(
			(decoration) =>
				readDecorationAttributes(decoration)?.[
					"data-pen-ai-review-preview-new"
				] === true,
		);

		expect(readVirtualText(decorations)).toBe(" world");
		expect(newDecorations).toHaveLength(3);
		expect(readDecorationAttributes(newDecorations[1])?.style).toContain(
			"animation-delay: 4ms",
		);
	});

	it("streams only the changed tail for same-block word replacements", () => {
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createReviewEditor({
				blockId: "body-1",
				text: "Hello John",
				deltas: [{ insert: "Hello John" }],
			}),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "text-range",
					blockId: "body-1",
					from: 0,
					to: 10,
				},
				text: "Hello Sarah",
				previousTextLength: 8,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(decorations).toContainEqual(
			expect.objectContaining({
				type: "inline",
				blockId: "body-1",
				from: 6,
				to: 10,
				attributes: expect.objectContaining({
					"data-pen-ai-review-role": "delete-hidden",
					"data-pen-final-text-review-hidden": true,
				}),
			}),
		);
		expect(readVirtualText(decorations)).toBe("Sarah");
		expect(readVirtualText(decorations)).not.toContain("Hello ");
	});

	it("preserves unchanged suffixes for same-block word replacements", () => {
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createReviewEditor({
				blockId: "body-1",
				text: "Hello John, how are you?",
				deltas: [{ insert: "Hello John, how are you?" }],
			}),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "text-range",
					blockId: "body-1",
					from: 0,
					to: 24,
				},
				text: "Hello Sarah, how are you?",
				previousTextLength: 9,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(decorations).toContainEqual(
			expect.objectContaining({
				type: "inline",
				blockId: "body-1",
				from: 6,
				to: 10,
				attributes: expect.objectContaining({
					"data-pen-ai-review-role": "delete-hidden",
					"data-pen-final-text-review-hidden": true,
				}),
			}),
		);
		expect(readVirtualText(decorations)).toBe("Sarah");
		expect(readVirtualText(decorations)).not.toContain(", how are you?");
	});

	it("does not hide the unchanged tail while a full replacement streams", () => {
		const originalText = MACBOOK_REPLACEMENT_ORIGINAL_TEXT;
		const previewText = buildMacBookProStreamingPreviewText(originalText);
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createReviewEditor({
				blockId: "body-1",
				text: originalText,
				deltas: [{ insert: originalText }],
			}),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "text-range",
					blockId: "body-1",
					from: 0,
					to: originalText.length,
				},
				text: previewText,
				previousTextLength: previewText.length - "Pro ".length,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(readVirtualText(decorations)).toBe("Pro ");
		expect(decorations).not.toContainEqual(
			expect.objectContaining({
				type: "inline",
				blockId: "body-1",
				from: expect.any(Number),
				to: originalText.length,
				attributes: expect.objectContaining({
					"data-pen-ai-review-role": "delete-hidden",
				}),
			}),
		);
	});

	it("does not hide unchanged blocks while a full block-range replacement streams", () => {
		const { firstBlockText, secondBlockText, thirdBlockText } =
			MACBOOK_THREE_BLOCK_PARTS;
		const originalText = [firstBlockText, secondBlockText, thirdBlockText].join(
			"\n",
		);
		const previewText = buildMacBookProStreamingPreviewText(originalText);
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createMacBookThreeBlockReviewEditor(),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "block-range",
					start: { blockId: "body-1", offset: 0 },
					end: { blockId: "body-3", offset: thirdBlockText.length },
					blockIds: ["body-1", "body-2", "body-3"],
				},
				text: previewText,
				previousTextLength: previewText.length - "Pro ".length,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(readVirtualText(decorations)).toBe("Pro ");
		expect(decorations).not.toContainEqual(
			expect.objectContaining({
				type: "block",
			}),
		);
	});

	it("does not add final-text context over the full selection during streaming preview", () => {
		const originalText = MACBOOK_REPLACEMENT_PARAGRAPH_TEXT;
		const previewText = buildMacBookProStreamingPreviewText(originalText);
		const decorations = buildAIReviewPresentationDecorations({
			activeGeneration: {
				id: "generation-1",
				sessionId: "session-1",
				status: "streaming",
			} as never,
			activeSessionId: "session-1",
			editor: createReviewEditor({
				blockId: "body-1",
				text: originalText,
				deltas: [{ insert: originalText }],
			}),
			sessions: [
				createInlineSession({
					focusOffset: originalText.length,
					pendingSuggestionIds: [],
				}),
			],
			streamingReviewPreview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "text-range",
					blockId: "body-1",
					from: 0,
					to: originalText.length,
				},
				text: previewText,
				previousTextLength: previewText.length - "Pro ".length,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});
		const contextDecorations = decorations.filter(
			(decoration) =>
				decoration.type === "inline" &&
				decoration.attributes?.["data-pen-ai-review-role"] ===
				"context",
		);

		expect(readVirtualText(decorations)).toBe("Pro ");
		expect(contextDecorations).toEqual([]);
	});

	it("previews streamed removals before final suggestions are applied", () => {
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createReviewEditor({
				blockId: "body-1",
				text: "Hello world",
				deltas: [{ insert: "Hello world" }],
			}),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "text-range",
					blockId: "body-1",
					from: 0,
					to: 11,
				},
				text: "Hello",
				previousTextLength: 5,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(decorations).toContainEqual(
			expect.objectContaining({
				type: "inline",
				blockId: "body-1",
				from: 5,
				to: 11,
				attributes: expect.objectContaining({
					"data-pen-ai-review-role": "delete-hidden",
					"data-pen-final-text-review-hidden": true,
				}),
			}),
		);
		expect(readVirtualText(decorations)).toBe("");
	});

	it("streams replacement text with newlines as a single linear virtual preview", () => {
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createReviewEditor({
				blockId: "body-1",
				text: "Hello",
				deltas: [{ insert: "Hello" }],
			}),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "text-range",
					blockId: "body-1",
					from: 0,
					to: 5,
				},
				text: "Hello\n\nWorld",
				previousTextLength: 5,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(readVirtualText(decorations)).toBe("\n\nWorld");
		expect(decorations).not.toContainEqual(
			expect.objectContaining({
				type: "block",
			}),
		);
	});

	it("previews multi-block range removals while replacement text streams", () => {
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createAlphaBetaGammaReviewEditor(),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "block-range",
					start: { blockId: "body-1", offset: 2 },
					end: { blockId: "body-3", offset: 3 },
					blockIds: ["body-1", "body-2", "body-3"],
				},
				text: "Replacement",
				previousTextLength: 0,
				revision: 1,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(decorations).toContainEqual(
			expect.objectContaining({
				type: "inline",
				blockId: "body-1",
				from: 2,
				to: 5,
			}),
		);
		expect(decorations).toContainEqual(
			expect.objectContaining({
				type: "inline",
				blockId: "body-3",
				from: 0,
				to: 3,
			}),
		);
		expect(decorations).toContainEqual(
			expect.objectContaining({
				type: "block",
				blockId: "body-2",
				attributes: expect.objectContaining({
					"data-pen-ai-review-role": "block-delete",
				}),
			}),
		);
		expect(readVirtualText(decorations)).toContain("Replacement");
	});

	it("streams same-paragraph multi-block replacements at changed words", () => {
		const decorations = buildStreamingReviewPreviewDecorations({
			editor: createAlphaBetaFriendReviewEditor(),
			preview: {
				sessionId: "session-1",
				turnId: "turn-1",
				target: {
					kind: "block-range",
					start: { blockId: "body-1", offset: 0 },
					end: { blockId: "body-2", offset: "Beta friend".length },
					blockIds: ["body-1", "body-2"],
				},
				text: "Alpha teammate\nBeta friend",
				previousTextLength: "Alpha ".length,
				revision: 2,
				updatedAt: 123,
			},
			suggestionPresentation: "final-text",
		});

		expect(decorations).toContainEqual(
			expect.objectContaining({
				type: "inline",
				blockId: "body-1",
				from: "Alpha ".length,
				to: "Alpha friend".length,
			}),
		);
		expect(decorations).not.toContainEqual(
			expect.objectContaining({
				type: "block",
			}),
		);
		expect(readVirtualText(decorations)).toBe("teammate");
		expect(readVirtualText(decorations)).not.toContain("Alpha ");
		expect(readVirtualText(decorations)).not.toContain("Beta friend");
	});

	it("includes streaming preview decorations alongside unrelated persistent suggestions", () => {
		const editor = createReviewEditor({
			blockId: "body-1",
			text: "Hello",
			deltas: [{ insert: "Hello" }],
		});

		const decorations = buildAIReviewPresentationDecorations({
			activeSessionId: "session-1",
			editor,
			sessions: [createInlineSession()],
			suggestionPresentation: "final-text",
			streamingReviewPreview: HI_TEXT_RANGE_STREAMING_PREVIEW,
		});

		expect(readVirtualText(decorations)).toContain("i");

		const decorationsWithSuggestion = buildAIReviewPresentationDecorations({
			activeSessionId: "session-1",
			editor: createHelloExclamationSuggestionEditor(),
			sessions: [createInlineSession()],
			suggestionPresentation: "final-text",
			streamingReviewPreview: HI_TEXT_RANGE_STREAMING_PREVIEW,
		});

		expect(readVirtualText(decorationsWithSuggestion)).toContain("i");
	});
});

