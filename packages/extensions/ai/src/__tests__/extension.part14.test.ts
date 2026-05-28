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
	it("keeps the controller state snapshot stable for no-op updates", () => {
		const editor = createEditor({
			extensions: [aiExtension()],
		});

		const controller = getAIController(editor)!;
		const initialState = controller.getState();

		controller.setSuggestMode(false);
		expect(controller.getState()).toBe(initialState);

		controller.closeCommandMenu();
		expect(controller.getState()).toBe(initialState);

		controller.dismissEphemeralSuggestion();
		expect(controller.getState()).toBe(initialState);
	});

	it("builds database review items with before and after cell previews", async () => {
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: JSON.stringify({
									kind: "database_edit",
									blockId: "database-1",
									steps: [
										{
											op: "update_cell",
											rowId: "row-1",
											columnId: "name",
											value: "Beta",
										},
									],
								}),
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const firstBlockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
				{
					type: "insert-block",
					blockId: "database-1",
					blockType: "database",
					props: {},
					position: { after: firstBlockId },
				},
				{
					type: "database-insert-row",
					blockId: "database-1",
					rowId: "row-1",
					values: {
						name: "Alpha",
						tags: "[]",
						done: "false",
					},
				},
			],
			{ origin: "system" },
		);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt("Update this database cell", {
			blockId: "database-1",
		});

		expect(generation.reviewItems).toEqual([
			expect.objectContaining({
				label: "Update cell",
				changeKind: "updated",
				section: "cell",
				detail: "Alpha · Name",
				before: "Alpha",
				after: "Beta",
			}),
		]);
	});

	it("keeps accepted structured review items in document undo history", async () => {
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: JSON.stringify({
									kind: "database_edit",
									blockId: "database-1",
									steps: [
										{
											op: "update_cell",
											rowId: "row-1",
											columnId: "name",
											value: "Beta",
										},
									],
								}),
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const firstBlockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
				{
					type: "insert-block",
					blockId: "database-1",
					blockType: "database",
					props: {},
					position: { after: firstBlockId },
				},
				{
					type: "database-insert-row",
					blockId: "database-1",
					rowId: "row-1",
					values: {
						name: "Alpha",
						tags: "[]",
						done: "false",
					},
				},
			],
			{ origin: "system" },
		);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt("Update this database cell", {
			blockId: "database-1",
		});
		const reviewItems = generation.reviewItems ?? [];
		const reviewItemIds = reviewItems.map((item) => item.id);

		expect(generation.planState).toBe("validated");
		expect(reviewItems).toHaveLength(1);
		expect(reviewItemIds).toHaveLength(1);

		expect(controller.acceptReviewItems(reviewItemIds)).toBe(true);
		expect(editor.getBlock("database-1")!.tableCell(0, 0)?.textContent()).toBe(
			"Beta",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock("database-1")!.tableCell(0, 0)?.textContent()).toBe(
			"Alpha",
		);

		expect(editor.undoManager.redo()).toBe(true);
		expect(editor.getBlock("database-1")!.tableCell(0, 0)?.textContent()).toBe(
			"Beta",
		);
	});

	it("treats structured review rejection as non-mutating UI state", async () => {
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: JSON.stringify({
									kind: "database_edit",
									blockId: "database-1",
									steps: [
										{
											op: "update_cell",
											rowId: "row-1",
											columnId: "name",
											value: "Beta",
										},
									],
								}),
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const firstBlockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
				{
					type: "insert-block",
					blockId: "database-1",
					blockType: "database",
					props: {},
					position: { after: firstBlockId },
				},
				{
					type: "database-insert-row",
					blockId: "database-1",
					rowId: "row-1",
					values: {
						name: "Alpha",
						tags: "[]",
						done: "false",
					},
				},
			],
			{ origin: "system" },
		);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt("Update this database cell", {
			blockId: "database-1",
		});
		const reviewItems = generation.reviewItems ?? [];
		const reviewItemIds = reviewItems.map((item) => item.id);

		expect(reviewItemIds).toHaveLength(1);
		expect(controller.rejectReviewItems(reviewItemIds)).toBe(true);
		expect(editor.getBlock("database-1")!.tableCell(0, 0)?.textContent()).toBe(
			"Alpha",
		);
		expect(editor.undoManager.canUndo()).toBe(false);
		expect(editor.undoManager.undo()).toBe(false);
		expect(controller.getState().activeGeneration?.planState).toBe("rejected");
		expect(controller.getState().activeGeneration?.reviewItems).toEqual([]);
	});

	it("keeps accepted structured review artifacts transient across history replay", async () => {
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: JSON.stringify({
									kind: "database_edit",
									blockId: "database-1",
									steps: [
										{
											op: "update_cell",
											rowId: "row-1",
											columnId: "name",
											value: "Beta",
										},
									],
								}),
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const firstBlockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
				{
					type: "insert-block",
					blockId: "database-1",
					blockType: "database",
					props: {},
					position: { after: firstBlockId },
				},
				{
					type: "database-insert-row",
					blockId: "database-1",
					rowId: "row-1",
					values: {
						name: "Alpha",
						tags: "[]",
						done: "false",
					},
				},
			],
			{ origin: "system" },
		);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt("Update this database cell", {
			blockId: "database-1",
		});
		const reviewItems = generation.reviewItems ?? [];
		const reviewItemIds = reviewItems.map((item) => item.id);

		expect(reviewItemIds).toHaveLength(1);
		expect(controller.acceptReviewItems(reviewItemIds)).toBe(true);
		expect(controller.getState().activeGeneration?.planState).toBe("none");
		expect(controller.getState().activeGeneration?.reviewItems).toEqual([]);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock("database-1")!.tableCell(0, 0)?.textContent()).toBe(
			"Alpha",
		);
		expect(controller.getState().activeGeneration?.planState).toBe("none");
		expect(controller.getState().activeGeneration?.reviewItems).toEqual([]);

		expect(editor.undoManager.redo()).toBe(true);
		expect(editor.getBlock("database-1")!.tableCell(0, 0)?.textContent()).toBe(
			"Beta",
		);
		expect(controller.getState().activeGeneration?.planState).toBe("none");
		expect(controller.getState().activeGeneration?.reviewItems).toEqual([]);
	});
});
