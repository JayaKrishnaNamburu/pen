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
	it("streams markdown table suggestions before completion for bottom-chat document prompts", async () => {
			const releaseFinalDelta = createDeferred();
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
									delta:
										"| First Name | Last Name |\n| --- | --- |\n| Alice | Johnson |",
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
				[{ type: "insert-text", blockId: introBlockId, offset: 0, text: "Intro" }],
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
				return tables[0]?.tableCell(1, 0)?.textContent() === "Alice";
			});

			expect(controller.getState().activeGeneration?.adapterId).toBe("flow-markdown");
			expect(controller.getState().activeGeneration?.blockClass).toBe("flow");
			expect(controller.getState().activeGeneration?.transportKind).toBe("flow-text");
			expect(controller.getState().activeGeneration?.mutationMode).toBe(
				"streaming-suggestions",
			);
			const previewTables = Array.from(editor.blocks("table"));
			expect(previewTables).toHaveLength(1);
			expect(previewTables[0]?.tableCell(1, 0)?.textContent()).toBe("Alice");
			expect(previewTables[0]?.tableCell(1, 1)?.textContent()).toBe("Johnson");

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
			expect(tables[0]?.tableCell(1, 0)?.textContent()).toBe("Alice");
			expect(tables[0]?.tableCell(1, 1)?.textContent()).toBe("Johnson");
			expect(tables[0]?.tableCell(2, 0)?.textContent()).toBe("Bob");
			expect(tables[0]?.tableCell(2, 1)?.textContent()).toBe("Smith");
		});

	it("builds rich preview details for newly inserted databases during direct bottom-chat apply", async () => {
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
									delta: JSON.stringify({
										kind: "review_bundle",
										label: "Create task database",
										reason: "Insert and seed a task database.",
										plans: [
											{
												kind: "block_insert",
												blockId: "task-db",
												blockType: "database",
												position: "last",
											},
											{
												kind: "database_edit",
												blockId: "task-db",
												steps: [
													{
														op: "insert_row",
														rowId: "row-1",
														values: {
															name: "Ship docs",
															tags: "[\"docs\"]",
															done: "false",
														},
													},
													{
														op: "add_view",
														view: {
															id: "view-list",
															title: "List view",
															type: "list",
															visibleColumnIds: ["name", "tags"],
															columnOrder: ["name", "tags", "done"],
														},
													},
												],
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

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			const generation = await controller.runSessionPrompt(
				session.id,
				"Create a task database table with views",
				{ target: "document" },
			);

			expect(generation.planState).toBe("validated");
			expect(generation.structuredPreview?.targets).toEqual([
				expect.objectContaining({
					blockId: "task-db",
					targetKind: "database",
					database: expect.objectContaining({
						columns: expect.arrayContaining([
							expect.objectContaining({ id: "name" }),
							expect.objectContaining({ id: "tags" }),
							expect.objectContaining({ id: "done" }),
						]),
						rows: [
							expect.objectContaining({
								id: "row-1",
								values: expect.objectContaining({
									name: "Ship docs",
								}),
							}),
						],
						views: expect.arrayContaining([
							expect.objectContaining({ id: "view-table" }),
							expect.objectContaining({ id: "view-list" }),
						]),
					}),
				}),
			]);
			expect(generation.reviewItems).toEqual([]);
			expect(editor.getBlock("task-db")?.type).toBe("database");
		});

	it("replaces existing tables through markdown suggestions", async () => {
			const editor = createEditor({
				extensions: [
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
					{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
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
			const initialRowCount = editor.getBlock("table-1")!.tableRowCount();

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Add a row to this table", {
				blockId: "table-1",
			});

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
			expect(editor.getBlock("table-1")?.tableRowCount()).toBe(initialRowCount);
		});

	it("accepts markdown table suggestions through the controller", async () => {
			const editor = createEditor({
				extensions: [
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
					{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
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
			const initialRowCount = editor.getBlock("table-1")!.tableRowCount();

			const controller = getAIController(editor)!;
			await controller.runPrompt("Add a row to this table", {
				blockId: "table-1",
			});

			expect(controller.acceptActiveGeneration()).toBe(true);
			const tables = Array.from(editor.blocks("table"));
			expect(tables).toHaveLength(1);
			expect(tables[0]?.tableRowCount()).toBe(initialRowCount + 1);
			expect(tables[0]?.tableCell(1, 0)?.textContent()).toBe("Alice");
			expect(tables[0]?.tableCell(2, 0)?.textContent()).toBe("Bob");
			expect(controller.getState().activeGeneration?.plan).toBeNull();
			expect(controller.getState().activeGeneration?.reviewItems).toEqual([]);
			expect(controller.getState().activeGeneration?.planState).toBe("none");
		});

	it("rejects markdown table suggestions without mutating the table", async () => {
			const editor = createEditor({
				extensions: [
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
					{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
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
			const initialRowCount = editor.getBlock("table-1")!.tableRowCount();

			const controller = getAIController(editor)!;
			await controller.runPrompt("Add a row to this table", {
				blockId: "table-1",
			});

			expect(controller.rejectActiveGeneration()).toBe(true);
			expect(editor.getBlock("table-1")!.tableRowCount()).toBe(initialRowCount);
			expect(Array.from(editor.blocks("table"))).toHaveLength(1);
			expect(controller.getState().activeGeneration?.plan).toBeNull();
			expect(controller.getState().activeGeneration?.reviewItems).toEqual([]);
			expect(controller.getState().activeGeneration?.planState).toBe("rejected");
		});
});
