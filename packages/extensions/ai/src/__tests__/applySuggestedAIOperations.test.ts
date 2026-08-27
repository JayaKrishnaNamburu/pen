import { createEditor } from "@input/pen-core";
import { describe, expect, it } from "vitest";
import { defaultSchema } from "@input/pen-schema";
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
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;

		const result = applySuggestedAIOperations(editor, {
			operations: [
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "Hello",
				},
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
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" }],
			{ origin: "system" },
		);

		const result = applySuggestedAIOperations(editor, {
			operations: [
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0 + 5,
					insert: "Hi",
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
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" }],
			{ origin: "system" },
		);

		const result = applySuggestedAIOperations(editor, {
			operations: [
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0 + 5,
					insert: "",
				},
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
		const editor = createEditor({ schema: defaultSchema });

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

	it("accepts text suggestions inside table cells and clears their marks", () => {
		const editor = createEditor({ schema: defaultSchema });
		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "t1",
					blockType: "table",
					props: { hasHeaderRow: false },
					position: "last",
				},
			],
			{ origin: "system" },
		);

		const result = applySuggestedAIOperations(editor, {
			operations: [
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 0,
					insert: "Alice",
				},
			],
			suggestionIds: ["cell-insert"],
		});

		expect(result.suggestionIds).toEqual(["cell-insert"]);
		expect(readAllSuggestions(editor)).toMatchObject([
			{
				kind: "text",
				id: "cell-insert",
				action: "insert",
				blockId: "t1",
				cell: { row: 0, col: 0 },
				offset: 0,
				length: 5,
			},
		]);
		expect(cellSuggestionActions(editor, "t1", 0, 0)).toEqual(["insert"]);

		expect(acceptSuggestion(editor, "cell-insert")).toBe(true);
		expect(readAllSuggestions(editor)).toEqual([]);
		expect(cellSuggestionActions(editor, "t1", 0, 0)).toEqual([]);
		expect(
			editor.getBlock("t1")!.as("table")!.tableCell(0, 0)!.textContent(),
		).toBe("Alice");
	});

	it("replaces table cell text as paired delete and insert suggestions", () => {
		const editor = createEditor({ schema: defaultSchema });
		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "t1",
					blockType: "table",
					props: { hasHeaderRow: false },
					position: "last",
				},
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 0,
					insert: "Alice",
				},
			],
			{ origin: "system" },
		);

		applySuggestedAIOperations(editor, {
			operations: [
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 5,
					insert: "Ada",
				},
			],
			suggestionIds: ["cell-delete", "cell-insert"],
		});

		expect(readSuggestionsFromBlock(editor, "t1")).toMatchObject([
			{
				kind: "text",
				id: "cell-delete",
				action: "delete",
				cell: { row: 0, col: 0 },
			},
			{
				kind: "text",
				id: "cell-insert",
				action: "insert",
				cell: { row: 0, col: 0 },
			},
		]);
		expect(cellSuggestionActions(editor, "t1", 0, 0)).toEqual([
			"delete",
			"insert",
		]);

		acceptAllSuggestions(editor);
		expect(readAllSuggestions(editor)).toEqual([]);
		expect(cellSuggestionActions(editor, "t1", 0, 0)).toEqual([]);
		expect(
			editor.getBlock("t1")!.as("table")!.tableCell(0, 0)!.textContent(),
		).toBe("Ada");
	});

	it("rejects text inserts inside table cells without leaving suggestion marks", () => {
		const editor = createEditor({ schema: defaultSchema });
		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "t1",
					blockType: "table",
					props: { hasHeaderRow: false },
					position: "last",
				},
			],
			{ origin: "system" },
		);

		applySuggestedAIOperations(editor, {
			operations: [
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 1, col: 1 },
					from: 0,
					to: 0,
					insert: "Bob",
				},
			],
			suggestionIds: ["cell-insert"],
		});

		expect(rejectSuggestion(editor, "cell-insert")).toBe(true);
		expect(readAllSuggestions(editor)).toEqual([]);
		expect(cellSuggestionActions(editor, "t1", 1, 1)).toEqual([]);
		expect(
			editor.getBlock("t1")!.as("table")!.tableCell(1, 1)!.textContent(),
		).toBe("");
	});
});

function cellSuggestionActions(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
	row: number,
	col: number,
): string[] {
	const cell = editor.getBlock(blockId)?.as("table")?.tableCell(row, col);
	if (!cell) {
		return [];
	}
	const actions: string[] = [];
	for (const delta of cell.inlineDeltas()) {
		const suggestion = delta.attributes?.suggestion;
		if (
			suggestion &&
			typeof suggestion === "object" &&
			"action" in suggestion &&
			typeof suggestion.action === "string"
		) {
			actions.push(suggestion.action);
		}
	}
	return actions;
}
