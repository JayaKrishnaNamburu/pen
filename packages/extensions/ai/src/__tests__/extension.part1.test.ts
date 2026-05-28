import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import {
	acceptAllSuggestions,
	acceptSuggestion,
	aiExtension,
	getAIInlineHistoryController,
	getAIController,
	rejectSuggestion,
} from "../index";
import {
	readAllSuggestions,
	readBlockSuggestionMeta,
	readSuggestionsFromBlock,
} from "../suggestions/persistent";
import {
	createDeferred,
	testStreamingToolExtension,
	waitForPreview,
} from "./extension.testUtils";

describe("aiExtension", () => {
	it("marks inserted and deleted text in suggest mode", () => {
			const editor = createEditor({
				extensions: [aiExtension({ suggestMode: true, author: "tester" })],
			});
			const blockId = editor.firstBlock()!.id;

			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "user" },
			);
			editor.apply(
				[{ type: "delete-text", blockId, offset: 6, length: 5 }],
				{ origin: "user" },
			);

			const block = editor.getBlock(blockId)!;
			const deltas = block.textDeltas();

			expect(deltas[0]?.attributes?.suggestion).toMatchObject({
				action: "insert",
				author: "tester",
			});
			expect(deltas[1]?.attributes?.suggestion).toMatchObject({
				action: "delete",
				author: "tester",
			});
			expect(block.textContent()).toBe("Hello world");
			expect(block.textContent({ resolved: true })).toBe("Hello ");
		});

	it("rejects persistent suggestions through the controller", () => {
			const editor = createEditor({
				extensions: [aiExtension({ suggestMode: true, author: "tester" })],
			});
			const blockId = editor.firstBlock()!.id;

			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "user" },
			);

			const controller = getAIController(editor)!;
			const suggestionsSnapshot = controller.getSuggestions();
			const suggestion = suggestionsSnapshot[0];
			expect(suggestion).toBeDefined();
			expect(controller.getSuggestions()).toBe(suggestionsSnapshot);

			expect(rejectSuggestion(editor, suggestion.id)).toBe(true);
			expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe("");
			expect(readSuggestionsFromBlock(editor, blockId)).toEqual([]);
			expect(readAllSuggestions(editor)).toEqual([]);
			expect(editor.getBlock(blockId)!.textContent()).toBe("");
		});

	it("accepts persistent suggestions without re-intercepting them", () => {
			const editor = createEditor({
				extensions: [aiExtension({ suggestMode: true, author: "tester" })],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "system" },
			);
			editor.apply(
				[{ type: "delete-text", blockId, offset: 0, length: 5 }],
				{ origin: "user" },
			);

			const [suggestion] = readSuggestionsFromBlock(editor, blockId);
			expect(suggestion).toBeDefined();

			expect(acceptSuggestion(editor, suggestion.id)).toBe(true);
			expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe("");
			expect(readSuggestionsFromBlock(editor, blockId)).toEqual([]);
			expect(readAllSuggestions(editor)).toEqual([]);
			expect(editor.getBlock(blockId)!.textContent()).toBe("");
		});

	it("keeps accepted delete suggestions in document undo history", () => {
			const editor = createEditor({
				extensions: [aiExtension({ suggestMode: true, author: "tester" })],
			});
			const blockId = editor.firstBlock()!.id;

			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "system" },
			);
			editor.apply(
				[{ type: "delete-text", blockId, offset: 0, length: 5 }],
				{ origin: "user" },
			);

			const [suggestion] = readSuggestionsFromBlock(editor, blockId);
			expect(suggestion).toBeDefined();
			expect(acceptSuggestion(editor, suggestion.id)).toBe(true);
			expect(editor.getBlock(blockId)!.textContent()).toBe("");
			expect(readSuggestionsFromBlock(editor, blockId)).toEqual([]);

			expect(editor.undoManager.undo()).toBe(true);
			expect(readSuggestionsFromBlock(editor, blockId)).toHaveLength(1);
			expect(readAllSuggestions(editor)).toHaveLength(1);

			expect(editor.undoManager.undo()).toBe(true);
			expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe("Hello");
			expect(readSuggestionsFromBlock(editor, blockId)).toEqual([]);

			expect(editor.undoManager.redo()).toBe(true);
			expect(readSuggestionsFromBlock(editor, blockId)).toHaveLength(1);
			expect(readAllSuggestions(editor)).toHaveLength(1);

			expect(editor.undoManager.redo()).toBe(true);
			expect(editor.getBlock(blockId)!.textContent()).toBe("");
			expect(readSuggestionsFromBlock(editor, blockId)).toEqual([]);
		});

	it("keeps rejected insert suggestions in document undo history", () => {
			const editor = createEditor({
				extensions: [aiExtension({ suggestMode: true, author: "tester" })],
			});
			const blockId = editor.firstBlock()!.id;

			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "user" },
			);

			const [suggestion] = readSuggestionsFromBlock(editor, blockId);
			expect(suggestion).toBeDefined();
			expect(rejectSuggestion(editor, suggestion.id)).toBe(true);
			expect(editor.getBlock(blockId)!.textContent()).toBe("");
			expect(readSuggestionsFromBlock(editor, blockId)).toEqual([]);

			expect(editor.undoManager.undo()).toBe(true);
			expect(readSuggestionsFromBlock(editor, blockId)).toHaveLength(1);
			expect(readAllSuggestions(editor)).toHaveLength(1);

			expect(editor.undoManager.undo()).toBe(true);
			expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe("");
			expect(readSuggestionsFromBlock(editor, blockId)).toEqual([]);

			expect(editor.undoManager.redo()).toBe(true);
			expect(readSuggestionsFromBlock(editor, blockId)).toHaveLength(1);
			expect(readAllSuggestions(editor)).toHaveLength(1);

			expect(editor.undoManager.redo()).toBe(true);
			expect(editor.getBlock(blockId)!.textContent()).toBe("");
			expect(readSuggestionsFromBlock(editor, blockId)).toEqual([]);
		});

	it("accepts multiple suggestions in one undo group", () => {
			const editor = createEditor({
				extensions: [aiExtension({ suggestMode: true, author: "tester" })],
			});
			const firstBlockId = editor.firstBlock()!.id;

			editor.apply(
				[{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Hello" }],
				{ origin: "user" },
			);
			editor.apply(
				[
					{
						type: "insert-block",
						blockId: "b2",
						blockType: "paragraph",
						props: {},
						position: "last",
					},
				],
				{ origin: "user" },
			);

			expect(readAllSuggestions(editor)).toHaveLength(2);

			acceptAllSuggestions(editor);
			expect(readAllSuggestions(editor)).toEqual([]);

			expect(editor.undoManager.undo()).toBe(true);
			expect(readAllSuggestions(editor)).toHaveLength(2);

			expect(editor.undoManager.redo()).toBe(true);
			expect(readAllSuggestions(editor)).toEqual([]);
		});

	it("runs a block generation with a model adapter", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: " world" };
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Continue", { blockId });

			expect(generation.status).toBe("complete");
			expect(editor.getBlock(blockId)!.textContent()).toBe("Hello world");
			expect(controller.getState().activeGeneration?.text).toBe(" world");
		});

	it("parses markdown block generations into structured blocks", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: { blockGeneration: "markdown" },
						model: {
							async *stream() {
								yield {
									type: "text-delta" as const,
									delta: "# Title\n\n- One",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const firstBlockId = editor.firstBlock()!.id;
			const targetBlockId = "target-block";
			const trailingBlockId = "trailing-block";
			editor.apply(
				[
					{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
					{
						type: "insert-block",
						blockId: targetBlockId,
						blockType: "paragraph",
						props: {},
						position: { after: firstBlockId },
					},
					{
						type: "insert-block",
						blockId: trailingBlockId,
						blockType: "paragraph",
						props: {},
						position: { after: targetBlockId },
					},
					{
						type: "insert-text",
						blockId: trailingBlockId,
						offset: 0,
						text: "Outro",
					},
				],
				{ origin: "system" },
			);
			const initialRowCount = editor.getBlock("table-1")?.tableRowCount();

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Continue this paragraph", {
				blockId: targetBlockId,
			});
			const blockOrder = editor.documentState.blockOrder;

			expect(generation.status).toBe("complete");
			expect(generation.contentFormat).toBe("markdown");
			expect(blockOrder).toHaveLength(4);
			expect(blockOrder).not.toContain(targetBlockId);
			expect(editor.getBlock(blockOrder[0])?.textContent()).toBe("Intro");
			expect(editor.getBlock(blockOrder[1])?.type).toBe("heading");
			expect(editor.getBlock(blockOrder[1])?.textContent()).toBe("Title");
			expect(editor.getBlock(blockOrder[2])?.type).toBe("bulletListItem");
			expect(editor.getBlock(blockOrder[2])?.textContent()).toBe("One");
			expect(editor.getBlock(blockOrder[3])?.textContent()).toBe("Outro");
		});

	it("runs a selection generation when text is selected", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: "planet" };
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Rewrite the selection");

			expect(generation.status).toBe("complete");
			expect(generation.mutationMode).toBe("streaming-suggestions");
			expect(editor.getBlock(blockId)!.textContent()).toBe("Hello worldplanet");
			expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe("Hello planet");
			expect(controller.getState().activeGeneration?.text).toBe("planet");
			expect(controller.getSuggestions().length).toBeGreaterThan(0);
		});

	it("uses selection-fast request mode for bottom-chat selection rewrites", async () => {
			let requestMode: string | undefined;
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream(options) {
								requestMode = options.requestMode;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "planet",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "selection",
			});
			await controller.runSessionPrompt(session.id, "Rewrite the selection");

			expect(requestMode).toBe("selection-fast");
		});
});
