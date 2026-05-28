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
	it("restores the previous accepted story when undoing a kept follow-up rewrite", async () => {
			let streamCount = 0;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								streamCount += 1;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text:
										streamCount === 1
											? "# The Lighthouse Keeper's Last Signal\n\nA lighthouse story."
											: "# The Cat Keeper's Last Purr\n\nA cat story.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});

			await controller.runSessionPrompt(session.id, "Write a story", {
				target: "document",
			});
			const firstTurnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[0]?.id ?? null;
			expect(firstTurnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, firstTurnId!)).toBe(true);

			await controller.runSessionPrompt(session.id, "Actually make it about cats", {
				target: "document",
			});
			const secondTurnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[1]?.id ?? null;
			expect(secondTurnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, secondTurnId!)).toBe(true);

			expect(editor.undoManager.undo()).toBe(true);

			const visibleBlockTextsAfterUndo = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(visibleBlockTextsAfterUndo).toEqual([
				"The Lighthouse Keeper's Last Signal",
				"A lighthouse story.",
			]);
		});

	it("trims leading blank lines when bottom-chat writes into an empty block", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "\n\nOnce upon a time",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});

			const generation = await controller.runSessionPrompt(
				session.id,
				"Write a short story",
				{ target: "document" },
			);

			const visibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);

			expect(generation.status).toBe("complete");
			expect(visibleBlockTexts).toEqual(["Once upon a time"]);
		});

	it("materializes bottom-chat paragraphs as separate blocks for empty targets", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "First paragraph.\n\nSecond paragraph.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});

			const generation = await controller.runSessionPrompt(
				session.id,
				"Write two paragraphs",
				{ target: "document" },
			);

			const visibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);

			expect(generation.status).toBe("complete");
			expect(visibleBlockTexts).toEqual([
				"First paragraph.",
				"Second paragraph.",
			]);
		});

	it("reuses a leading empty placeholder for document-target bottom-chat writes", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream() {
								yield {
									type: "text-delta" as const,
									delta: "Story opener.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const placeholderBlockId = editor.firstBlock()!.id;
			const trailingBlockId = "trailing-block";
			editor.apply(
				[
					{
						type: "insert-block",
						blockId: trailingBlockId,
						blockType: "paragraph",
						props: {},
						position: { after: placeholderBlockId },
					},
					{
						type: "insert-text",
						blockId: trailingBlockId,
						offset: 0,
						text: "Existing content",
					},
				],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});

			const generation = await controller.runSessionPrompt(
				session.id,
				"Write a short story",
				{ target: "document" },
			);
			const blockOrder = editor.documentState.blockOrder;
			const visibleBlockTexts = blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);

			expect(generation.status).toBe("complete");
			expect(blockOrder).toHaveLength(3);
			expect(visibleBlockTexts).toEqual(["Story opener.", "Existing content"]);
			expect(readBlockSuggestionMeta(editor.getBlock(placeholderBlockId))?.action).toBe(
				"delete-block",
			);
		});

	it("prefers the caret block over unrelated empty placeholders for document-target writes", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream() {
								yield {
									type: "text-delta" as const,
									delta: "Follow the caret.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const placeholderBlockId = editor.firstBlock()!.id;
			const caretBlockId = "caret-block";
			editor.apply(
				[
					{
						type: "insert-block",
						blockId: caretBlockId,
						blockType: "paragraph",
						props: {},
						position: { after: placeholderBlockId },
					},
					{
						type: "insert-text",
						blockId: caretBlockId,
						offset: 0,
						text: "Existing content",
					},
				],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId: caretBlockId, offset: 8 },
				{ blockId: caretBlockId, offset: 8 },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});

			const generation = await controller.runSessionPrompt(
				session.id,
				"Write more here",
				{ target: "document" },
			);
			const blockOrder = editor.documentState.blockOrder;
			const visibleBlockTexts = blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);

			expect(generation.status).toBe("complete");
			expect(blockOrder).toHaveLength(3);
			expect(visibleBlockTexts).toEqual(["Existing content", "Follow the caret."]);
		});

	it("creates tables through markdown for bottom-chat document prompts", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream() {
								yield {
									type: "text-delta" as const,
									delta: "| Tier | Price |\n| --- | --- |\n| Pro | $20 |",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const introBlockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId: introBlockId, offset: 0, text: "Intro" }],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			const generation = await controller.runSessionPrompt(
				session.id,
				"Create a pricing table",
				{ target: "document" },
			);

			expect(generation.status).toBe("complete");
			expect(generation.contentFormat).toBe("markdown");
			expect(generation.planState).toBe("none");
			expect(generation.reviewItems).toEqual([]);
			expect(generation.adapterId).toBe("flow-markdown");
			expect(generation.blockClass).toBe("flow");
			expect(generation.transportKind).toBe("flow-text");
			expect(generation.mutationMode).toBe("streaming-suggestions");
			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			expect(generation.suggestionIds?.length ?? 0).toBeGreaterThan(0);
			const tables = Array.from(editor.blocks("table"));
			expect(tables).toHaveLength(1);
			expect(tables[0]?.tableCell(0, 0)?.textContent()).toBe("Tier");
			expect(tables[0]?.tableCell(0, 1)?.textContent()).toBe("Price");
			expect(tables[0]?.tableCell(1, 0)?.textContent()).toBe("Pro");
			expect(tables[0]?.tableCell(1, 1)?.textContent()).toBe("$20");
			expect(controller.acceptActiveGeneration()).toBe(true);
		});
});
