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
	it("builds comparison rows for database view changes", async () => {
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
												op: "add_view",
												view: {
													id: "view-list",
													title: "List view",
													type: "list",
													visibleColumnIds: ["name", "tags"],
													columnOrder: ["name", "tags", "done"],
													sort: [{ columnId: "name", direction: "asc" }],
													filter: null,
													groupBy: "tags",
													pageIndex: 0,
													pageSize: 50,
												},
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
				],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Add a grouped list view", {
				blockId: "database-1",
			});

			expect(generation.reviewItems).toEqual([
				expect.objectContaining({
					label: "Add view",
					comparisonRows: expect.arrayContaining([
						expect.objectContaining({
							label: "View",
							after: "List view",
							changeKind: "added",
							section: "view",
						}),
						expect.objectContaining({
							label: "Group by",
							after: "Tags",
							changeKind: "updated",
							section: "view",
						}),
						expect.objectContaining({
							label: "Visible columns",
							after: "Name, Tags",
							changeKind: "updated",
							section: "view",
						}),
					]),
				}),
			]);
		});
});
