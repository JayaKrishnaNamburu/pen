import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../stream";
import { documentOpsExtension } from "@input/pen-document-ops";
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
import { defaultSchema } from "@input/pen-schema-default";
import {
	createDeferred,
	testStreamingToolExtension,
	waitForPreview,
} from "./extension.testUtils";

describe("aiExtension", () => {
	it("streams markdown table suggestions before completion for bottom-chat document prompts", async () => {
		const releaseFinalDelta = createDeferred();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					contentFormat: {
						blockGeneration: "markdown",
					},
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: "| First Name | Last Name |\n| --- | --- |\n| Alice | Johnson |",
							};
							await releaseFinalDelta.promise;
							yield {
								type: "text-delta" as const,
								delta: "\n| Bob | Smith |",
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const introBlockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: introBlockId,
					from: 0,
				to: 0,
				insert: "Intro",
				},
			],
			{ origin: "system" },
		);

		const controller = getAIController(editor)!;
		const session = controller.startSession({
			surface: "bottom-chat",
			target: "document",
		});
		const generationPromise = controller.runSessionPrompt(
			session.id,
			"Create a table with names in it",
			{ target: "document" },
		);

		await waitForPreview(() => {
			const tables = Array.from(editor.blocks("table"));
			return (
				tables[0]?.as("table")?.tableCell(1, 0)?.textContent() ===
				"Alice"
			);
		});

		expect(controller.getState().activeGeneration?.adapterId).toBe(
			"flow-markdown",
		);
		expect(controller.getState().activeGeneration?.blockClass).toBe("flow");
		expect(controller.getState().activeGeneration?.transportKind).toBe(
			"flow-text",
		);
		expect(controller.getState().activeGeneration?.mutationMode).toBe(
			"streaming-suggestions",
		);
		const previewTables = Array.from(editor.blocks("table"));
		expect(previewTables).toHaveLength(1);
		expect(
			previewTables[0].as("table")?.tableCell(1, 0)?.textContent(),
		).toBe("Alice");
		expect(
			previewTables[0].as("table")?.tableCell(1, 1)?.textContent(),
		).toBe("Johnson");

		releaseFinalDelta.resolve();
		const generation = await generationPromise;

		expect(generation.planState).toBe("none");
		expect(generation.reviewItems).toEqual([]);
		expect(generation.adapterId).toBe("flow-markdown");
		expect(generation.blockClass).toBe("flow");
		expect(generation.transportKind).toBe("flow-text");
		expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
		const tables = Array.from(editor.blocks("table"));
		expect(tables).toHaveLength(1);
		expect(tables[0].as("table")?.tableCell(1, 0)?.textContent()).toBe(
			"Alice",
		);
		expect(tables[0].as("table")?.tableCell(1, 1)?.textContent()).toBe(
			"Johnson",
		);
		expect(tables[0].as("table")?.tableCell(2, 0)?.textContent()).toBe(
			"Bob",
		);
		expect(tables[0].as("table")?.tableCell(2, 1)?.textContent()).toBe(
			"Smith",
		);
	});

	it("replaces existing tables through markdown suggestions", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: [
									"| Name |",
									"| --- |",
									"| Alice |",
									"| Bob |",
								].join("\n"),
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
				{
					type: "splice-text",
					blockId: firstBlockId,
					from: 0,
				to: 0,
				insert: "Intro",
				},
				{
					type: "insert-block",
					blockId: "table-1",
					blockType: "table",
					props: {},
					position: { after: firstBlockId },
				},
			],
			{ origin: "system" },
		);
		const initialRowCount = editor
			.getBlock("table-1")!
			.as("table")!
			.tableRowCount();

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Add a row to this table",
			{
				blockId: "table-1",
			},
		);

		expect(generation.status).toBe("complete");
		expect(generation.targetKind).toBe("table");
		expect(generation.planState).toBe("none");
		expect(generation.plan).toBeNull();
		expect(generation.adapterId).toBe("flow-markdown");
		expect(generation.transportKind).toBe("flow-text");
		expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
		expect(generation.reviewItems).toEqual([]);
		expect(generation.debug?.structured).toMatchObject({
			plannerMode: "text",
			targetKind: "table",
			validationIssueCount: 0,
		});
		expect(generation.suggestionIds?.length ?? 0).toBeGreaterThan(0);
		expect(editor.getBlock("table-1")!.as("table")?.tableRowCount()).toBe(
			initialRowCount,
		);
	});

	it("accepts markdown table suggestions through the controller", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: [
									"| Name |",
									"| --- |",
									"| Alice |",
									"| Bob |",
								].join("\n"),
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
				{
					type: "splice-text",
					blockId: firstBlockId,
					from: 0,
				to: 0,
				insert: "Intro",
				},
				{
					type: "insert-block",
					blockId: "table-1",
					blockType: "table",
					props: {},
					position: { after: firstBlockId },
				},
			],
			{ origin: "system" },
		);
		const initialRowCount = editor
			.getBlock("table-1")!
			.as("table")!
			.tableRowCount();

		const controller = getAIController(editor)!;
		await controller.runPrompt("Add a row to this table", {
			blockId: "table-1",
		});

		expect(controller.acceptActiveGeneration()).toBe(true);
		const tables = Array.from(editor.blocks("table"));
		expect(tables).toHaveLength(1);
		expect(tables[0].as("table")?.tableRowCount()).toBe(
			initialRowCount + 1,
		);
		expect(tables[0].as("table")?.tableCell(1, 0)?.textContent()).toBe(
			"Alice",
		);
		expect(tables[0].as("table")?.tableCell(2, 0)?.textContent()).toBe(
			"Bob",
		);
		expect(controller.getState().activeGeneration?.plan).toBeNull();
		expect(controller.getState().activeGeneration?.reviewItems).toEqual([]);
		expect(controller.getState().activeGeneration?.planState).toBe("none");
	});

	it("rejects markdown table suggestions without mutating the table", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: [
									"| Name |",
									"| --- |",
									"| Alice |",
									"| Bob |",
								].join("\n"),
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
				{
					type: "splice-text",
					blockId: firstBlockId,
					from: 0,
				to: 0,
				insert: "Intro",
				},
				{
					type: "insert-block",
					blockId: "table-1",
					blockType: "table",
					props: {},
					position: { after: firstBlockId },
				},
			],
			{ origin: "system" },
		);
		const initialRowCount = editor
			.getBlock("table-1")!
			.as("table")!
			.tableRowCount();

		const controller = getAIController(editor)!;
		await controller.runPrompt("Add a row to this table", {
			blockId: "table-1",
		});

		expect(controller.rejectActiveGeneration()).toBe(true);
		expect(editor.getBlock("table-1")!.as("table")!.tableRowCount()).toBe(
			initialRowCount,
		);
		expect(Array.from(editor.blocks("table"))).toHaveLength(1);
		expect(controller.getState().activeGeneration?.plan).toBeNull();
		expect(controller.getState().activeGeneration?.reviewItems).toEqual([]);
		expect(controller.getState().activeGeneration?.planState).toBe(
			"rejected",
		);
	});
});
