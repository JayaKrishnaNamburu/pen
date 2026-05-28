import { describe, expect, it } from "vitest";
import {
	buildAIReviewPresentationDecorations,
	resolveAIReviewPresentationState,
} from "../review/reviewPresentation";
import {
	createInlineSession,
	createReviewEditor,
} from "./reviewPresentation.testHelpers";

describe("AI review presentation", () => {
	it("keeps affected context out of inserted suggestion ranges", () => {
		const editor = createReviewEditor({
			blockId: "body-1",
			text: "Sounds good eat",
			deltas: [
				{ insert: "Sounds " },
				{
					insert: "good",
					attributes: {
						suggestion: {
							id: "suggestion-insert-1",
							action: "insert",
							author: "assistant",
							authorType: "ai",
						},
					},
				},
				{ insert: " eat" },
			],
		});

		const decorations = buildAIReviewPresentationDecorations({
			activeSessionId: "session-1",
			editor,
			sessions: [createInlineSession()],
			suggestionPresentation: "track-changes",
		});
		const inlineDecorations = decorations.filter(
			(decoration) => decoration.type === "inline",
		);
		const insertDecoration = inlineDecorations.find(
			(decoration) =>
				decoration.attributes?.["data-suggestion-id"] ===
				"suggestion-insert-1",
		);
		const contextDecorations = inlineDecorations.filter(
			(decoration) =>
				decoration.attributes?.["data-pen-ai-review-role"] ===
				"context",
		);

		expect(insertDecoration?.from).toBe(7);
		expect(insertDecoration?.to).toBe(11);
		expect(insertDecoration?.attributes?.["data-ai-affected-range"]).toBe(
			undefined,
		);
		expect(insertDecoration?.attributes?.["data-pen-ai-review-role"]).toBe(
			"insert",
		);
		expect(
			contextDecorations.map(({ from, to }) => ({ from, to })),
		).toEqual([
			{ from: 0, to: 7 },
			{ from: 11, to: 15 },
		]);
	});

	it("keeps final-text review focused on the diff instead of painting the whole selection", () => {
		const editor = createReviewEditor({
			blockId: "body-1",
			text: "Sounds good eat",
			deltas: [
				{ insert: "Sounds " },
				{
					insert: "good",
					attributes: {
						suggestion: {
							id: "suggestion-insert-1",
							action: "insert",
							author: "assistant",
							authorType: "ai",
						},
					},
				},
				{ insert: " eat" },
			],
		});

		const decorations = buildAIReviewPresentationDecorations({
			activeSessionId: "session-1",
			editor,
			sessions: [createInlineSession()],
			suggestionPresentation: "final-text",
		});
		const contextDecorations = decorations.filter(
			(decoration) =>
				decoration.type === "inline" &&
				decoration.attributes?.["data-pen-ai-review-role"] ===
				"context",
		);

		expect(contextDecorations).toEqual([]);
	});

	it("resolves review state from the active inline session", () => {
		expect(
			resolveAIReviewPresentationState({
				activeGeneration: null,
				activeSession: createInlineSession(),
				hasSuggestions: true,
			}),
		).toBe("user-reviewing");
		expect(
			resolveAIReviewPresentationState({
				activeGeneration: null,
				activeSession: null,
				hasSuggestions: true,
			}),
		).toBe("resolved");
	});
});
