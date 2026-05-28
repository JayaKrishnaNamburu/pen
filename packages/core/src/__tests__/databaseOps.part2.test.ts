import { describe, expect, it } from "vitest";
import { createEditor } from "../index";
import type { DocumentOp } from "@pen/types";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

type RawDatabaseBlockMap = {
	get(key: string): unknown;
};

type LengthLike = {
	length: number;
};

function databaseEditor() {
	const editor = createEditor({
		preset: noDefaultExtensionsPreset,
	});
	editor.apply([
		{
			type: "insert-block",
			blockId: "d1",
			blockType: "database",
			props: {},
			position: "last",
		},
	]);
	return editor;
}


describe("database core operations", () => {
	it("normalizes invalid database view references on write", () => {
		const editor = databaseEditor();

		editor.apply([
			{
				type: "database-insert-row",
				blockId: "d1",
				rowId: "row-a",
				values: {
					name: "Alpha",
					tags: "todo",
					status: "true",
				},
			},
			{
				type: "database-update-view",
				blockId: "d1",
				patch: {
					visibleColumnIds: ["name", "missing", "name"],
					columnOrder: ["missing", "tags", "name", "tags"],
					sort: [
						{ columnId: "missing", direction: "asc" },
						{ columnId: "tags", direction: "asc" },
						{ columnId: "tags", direction: "desc" },
					],
					filter: {
						operator: "and",
						conditions: [
							{ columnId: "missing", operator: "is", value: "x" },
							{ columnId: "tags", operator: "is", value: "todo" },
						],
					},
					groupBy: "missing",
					rowPinning: {
						top: ["missing-row", "row-a", "row-a"],
						bottom: ["row-a", "missing-row"],
					},
				},
			},
		]);

		const view = editor.getBlock("d1")?.databaseActiveView();
		expect(view?.visibleColumnIds).toEqual(["name"]);
		expect(view?.columnOrder).toEqual(["tags", "name"]);
		expect(view?.sort).toEqual([{ columnId: "tags", direction: "asc" }]);
		expect(view?.filter).toEqual({
			operator: "and",
			conditions: [{ columnId: "tags", operator: "is", value: "todo" }],
		});
		expect(view?.groupBy).toBeUndefined();
		expect(view?.rowPinning).toEqual({
			top: ["row-a"],
			bottom: undefined,
		});

		editor.destroy();
	});

	it("database row and select option ops clean up dependent data", () => {
		const editor = databaseEditor();
		editor.apply([
			{
				type: "database-update-view",
				blockId: "d1",
				patch: {
					rowPinning: {
						top: ["row-a"],
						bottom: ["row-b"],
					},
				},
			},
			{
				type: "database-update-column",
				blockId: "d1",
				columnId: "tags",
				patch: {
					options: [
						{ id: "bug", value: "Bug", color: "red" },
						{ id: "chore", value: "Chore", color: "gray" },
					],
				},
			},
			{
				type: "database-convert-column",
				blockId: "d1",
				columnId: "tags",
				toType: "multiSelect",
			},
			{
				type: "database-insert-row",
				blockId: "d1",
				rowId: "row-a",
				values: {
					name: "A",
					tags: JSON.stringify(["bug", "chore"]),
				},
			},
			{
				type: "database-insert-row",
				blockId: "d1",
				rowId: "row-b",
				values: {
					name: "B",
					tags: JSON.stringify(["bug"]),
				},
			},
			{
				type: "database-update-select-options",
				blockId: "d1",
				columnId: "tags",
				action: "remove",
				optionId: "bug",
			},
			{
				type: "database-duplicate-row",
				blockId: "d1",
				rowId: "row-a",
				newRowId: "row-c",
			},
			{
				type: "database-delete-rows",
				blockId: "d1",
				rowIds: ["row-b"],
			},
			{
				type: "database-move-row",
				blockId: "d1",
				rowId: "row-c",
				index: 0,
			},
		]);

		const block = editor.getBlock("d1")!;
		expect(block.tableRowCount()).toBe(2);
		expect(block.tableRow(0)?.id).toBe("row-a");
		expect(block.tableRow(1)?.id).toBe("row-c");
		expect(block.tableCell(0, 1)?.textContent()).toBe(JSON.stringify(["chore"]));
		expect(block.tableCell(1, 1)?.textContent()).toBe(JSON.stringify(["chore"]));
		expect(block.tableColumns()[1]?.options).toEqual([
			{ id: "chore", value: "Chore", color: "gray" },
		]);

		editor.apply([
			{
				type: "database-remove-column",
				blockId: "d1",
				columnId: "tags",
			},
		]);

		const nextBlock = editor.getBlock("d1")!;
		expect(nextBlock.tableColumns().map((column) => column.id)).toEqual([
			"name",
			"status",
		]);
		expect(nextBlock.databaseActiveView()?.columnOrder).toEqual([
			"name",
			"status",
		]);
		expect(nextBlock.databaseActiveView()?.visibleColumnIds).toEqual([
			"name",
			"status",
		]);
		expect(nextBlock.databaseActiveView()?.rowPinning).toBeUndefined();
		editor.destroy();
	});

	it("renaming a select option preserves stored option ids", () => {
		const editor = databaseEditor();
		editor.apply([
			{
				type: "database-update-column",
				blockId: "d1",
				columnId: "tags",
				patch: {
					options: [{ id: "todo", value: "Todo", color: "gray" }],
				},
			},
			{
				type: "database-insert-row",
				blockId: "d1",
				rowId: "row-1",
				values: {
					name: "Write docs",
					tags: "todo",
				},
			},
			{
				type: "database-update-select-options",
				blockId: "d1",
				columnId: "tags",
				action: "rename",
				optionId: "todo",
				value: "Ready",
			},
		]);

		const block = editor.getBlock("d1")!;
		expect(block.tableCell(0, 1)?.textContent()).toBe("todo");
		expect(block.tableColumns()[1]?.options).toEqual([
			{ id: "todo", value: "Ready", color: "gray" },
		]);
		editor.destroy();
	});

	it("rejects column type changes through database-update-column", () => {
		const editor = databaseEditor();
		editor.apply([{
			type: "database-update-column",
			blockId: "d1",
			columnId: "name",
			patch: {
				type: "number",
				title: "Name field",
			},
		} as DocumentOp]);

		const block = editor.getBlock("d1")!;
		expect(block.tableColumns()[0]).toEqual(
			expect.objectContaining({
				id: "name",
				title: "Name field",
				type: "text",
			}),
		);
		editor.destroy();
	});

	it("normalizes typed database row writes and rejects invalid updates", () => {
		const editor = databaseEditor();
		editor.apply([{
			type: "update-table-columns",
			blockId: "d1",
			columns: [
				{ id: "score", title: "Score", type: "number" },
				{ id: "done", title: "Done", type: "checkbox" },
				{
					id: "status",
					title: "Status",
					type: "select",
					options: [{ id: "todo", value: "Todo" }],
				},
				{
					id: "labels",
					title: "Labels",
					type: "multiSelect",
					options: [{ id: "todo", value: "Todo" }],
				},
			],
		}]);

		editor.apply([{
			type: "database-insert-row",
			blockId: "d1",
			rowId: "row-typed",
			values: {
				score: "not-a-number",
				done: "yes",
				status: "Todo",
				labels: JSON.stringify(["Todo"]),
			},
		}]);

		const block = editor.getBlock("d1")!;
		expect(block.tableCell(0, 0)?.textContent()).toBe("");
		expect(block.tableCell(0, 1)?.textContent()).toBe("true");
		expect(block.tableCell(0, 2)?.textContent()).toBe("todo");
		expect(block.tableCell(0, 3)?.textContent()).toBe(JSON.stringify(["todo"]));

		editor.apply([{
			type: "database-update-cell",
			blockId: "d1",
			rowId: "row-typed",
			columnId: "score",
			value: "42",
		}]);
		expect(block.tableCell(0, 0)?.textContent()).toBe("42");

		editor.apply([{
			type: "database-update-cell",
			blockId: "d1",
			rowId: "row-typed",
			columnId: "score",
			value: "still-not-a-number",
		}]);
		expect(block.tableCell(0, 0)?.textContent()).toBe("42");

		editor.destroy();
	});

});
