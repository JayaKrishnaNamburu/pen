import { createEditor } from "@pen/core";
import { describe, expect, it } from "vitest";
import {
	acceptAllSuggestions,
	acceptSuggestion,
	applySuggestedAIOperations,
	readAllSuggestions,
	readBlockSuggestionMeta,
	readSuggestionsFromBlock,
	rejectSuggestion,
} from "../index";

describe("applySuggestedAIOperations", () => {
	it("creates accept-compatible text insert suggestions with provenance", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;

		const result = applySuggestedAIOperations(editor, {
			operations: [
				{ type: "insert-text", blockId, offset: 0, text: "Hello" },
			],
			requestId: "request-1",
			sessionId: "session-1",
			turnId: "turn-1",
			generationId: "generation-1",
			model: "test-model",
			suggestionIds: ["suggestion-insert"],
			createdAt: 1_762_000_000_000,
		});

		expect(result.suggestionIds).toEqual(["suggestion-insert"]);
		expect(result.suggestions[0]).toMatchObject({
			kind: "text",
			id: "suggestion-insert",
			action: "insert",
			authorType: "ai",
			requestId: "request-1",
			sessionId: "session-1",
			turnId: "turn-1",
			generationId: "generation-1",
			model: "test-model",
		});
		expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe(
			"Hello",
		);

		expect(acceptSuggestion(editor, "suggestion-insert")).toBe(true);
		expect(readAllSuggestions(editor)).toEqual([]);
		expect(editor.getBlock(blockId)!.textContent()).toBe("Hello");
	});

	it("creates accept-compatible text replace suggestions", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
			{ origin: "system" },
		);

		const result = applySuggestedAIOperations(editor, {
			operations: [
				{
					type: "replace-text",
					blockId,
					offset: 0,
					length: 5,
					text: "Hi",
				},
			],
			requestId: "request-2",
			sessionId: "session-2",
			turnId: "turn-2",
			generationId: "generation-2",
			suggestionIds: ["suggestion-delete", "suggestion-insert"],
		});

		expect(result.suggestionIds).toEqual([
			"suggestion-delete",
			"suggestion-insert",
		]);
		expect(readSuggestionsFromBlock(editor, blockId)).toHaveLength(2);
		expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe(
			"Hi",
		);

		acceptAllSuggestions(editor);
		expect(readAllSuggestions(editor)).toEqual([]);
		expect(editor.getBlock(blockId)!.textContent()).toBe("Hi");
	});

	it("creates reject-compatible text delete suggestions", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
			{ origin: "system" },
		);

		const result = applySuggestedAIOperations(editor, {
			operations: [
				{ type: "delete-text", blockId, offset: 0, length: 5 },
			],
			requestId: "request-3",
			sessionId: "session-3",
			turnId: "turn-3",
			generationId: "generation-3",
			suggestionIds: ["suggestion-delete"],
		});

		expect(result.suggestionIds).toEqual(["suggestion-delete"]);
		expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe(
			"",
		);

		expect(rejectSuggestion(editor, "suggestion-delete")).toBe(true);
		expect(readAllSuggestions(editor)).toEqual([]);
		expect(editor.getBlock(blockId)!.textContent()).toBe("Hello");
	});

	it("creates reject-compatible block suggestions", () => {
		const editor = createEditor();

		const result = applySuggestedAIOperations(editor, {
			operations: [
				{
					type: "insert-block",
					blockId: "ai-block",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			],
			requestId: "request-4",
			sessionId: "session-4",
			turnId: "turn-4",
			generationId: "generation-4",
			suggestionIds: ["suggestion-block"],
		});

		expect(result.suggestionIds).toEqual(["suggestion-block"]);
		expect(
			readBlockSuggestionMeta(editor.getBlock("ai-block")),
		).toMatchObject({
			id: "suggestion-block",
			action: "insert-block",
			requestId: "request-4",
			sessionId: "session-4",
			turnId: "turn-4",
			generationId: "generation-4",
		});

		expect(rejectSuggestion(editor, "suggestion-block")).toBe(true);
		expect(editor.getBlock("ai-block")).toBeNull();
	});
});
