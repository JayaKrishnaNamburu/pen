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
	it("insert-block with database type seeds shared grid structures", () => {
		const editor = databaseEditor();
		const block = editor.getBlock("d1")!;
		expect(block.type).toBe("database");
		expect(block.tableRowCount()).toBe(0);

		const columns = block.tableColumns();
		expect(columns).toHaveLength(3);
		expect(columns.map((column) => column.title)).toEqual(["Name", "Tags", "Done"]);
		expect(columns.map((column) => column.type)).toEqual(["text", "select", "checkbox"]);

		const blockMap = editor.internals.doc.blocks.get("d1") as
			| RawDatabaseBlockMap
			| undefined;
		if (!blockMap) {
			throw new Error("Expected database block to exist");
		}
		expect(blockMap.get("collectionContent")).toBeUndefined();
		expect((blockMap.get("tableContent") as LengthLike).length).toBe(0);
		expect((blockMap.get("tableColumns") as LengthLike).length).toBe(3);
		expect((blockMap.get("databaseViews") as LengthLike).length).toBe(1);
		expect(typeof blockMap.get("databasePrimaryViewId")).toBe("string");
		editor.destroy();
	});

	it("convert-block from table to database derives columns titles and stable row ids", () => {
		const editor = createEditor({
			preset: noDefaultExtensionsPreset,
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: { hasHeaderRow: true },
				position: "last",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 0,
				offset: 0,
				text: "Name",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 1,
				offset: 0,
				text: "Status",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 1,
				col: 0,
				offset: 0,
				text: "Alpha",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 1,
				col: 1,
				offset: 0,
				text: "Open",
			},
		]);

		editor.apply([{ type: "convert-block", blockId: "t1", newType: "database" }]);

		const block = editor.getBlock("t1")!;
		expect(block.type).toBe("database");
		expect(block.tableColumns().map((column) => column.title)).toEqual([
			"Name",
			"Status",
		]);
		expect(block.tableColumns().map((column) => column.type)).toEqual([
			"text",
			"text",
		]);
		expect(block.tableRowCount()).toBe(1);
		expect(block.tableCell(0, 0)?.textContent()).toBe("Alpha");
		expect(block.tableCell(0, 1)?.textContent()).toBe("Open");
		expect(block.tableRow(0)?.id).toEqual(expect.any(String));

		editor.destroy();
	});

	it("update-table-columns stores structured column metadata", () => {
		const editor = databaseEditor();

		editor.apply([
			{
				type: "update-table-columns",
				blockId: "d1",
				columns: [
					{
						id: "name",
						title: "Name",
						type: "text",
						width: 240,
						hidden: false,
						options: [],
					},
					{
						id: "status",
						title: "Status",
						type: "select",
						pinned: "left",
						options: [{ id: "todo", value: "Todo", color: "gray" }],
						format: { style: "plain" },
					},
				],
			},
		]);

		const block = editor.getBlock("d1")!;
		expect(block.tableColumns()).toEqual([
			{
				id: "name",
				title: "Name",
				type: "text",
				width: 240,
				hidden: false,
				pinned: undefined,
				options: [],
				format: undefined,
				readonly: undefined,
			},
			{
				id: "status",
				title: "Status",
				type: "select",
				width: undefined,
				hidden: undefined,
				pinned: "left",
				options: [{ id: "todo", value: "Todo", color: "gray" }],
				format: { style: "plain" },
				readonly: undefined,
			},
		]);

		const blockMap = editor.internals.doc.blocks.get("d1") as
			| RawDatabaseBlockMap
			| undefined;
		if (!blockMap) {
			throw new Error("Expected database block to exist");
		}
		expect(typeof blockMap.get("tableColumns")).not.toBe("string");
		expect((blockMap.get("tableColumns") as LengthLike).length).toBe(2);
		expect(block.databaseActiveView()).toEqual(
			expect.objectContaining({
				columnOrder: ["name", "status"],
				visibleColumnIds: ["name", "status"],
			}),
		);
		editor.destroy();
	});

	it("rejects structural table ops against database blocks", () => {
		const editor = databaseEditor();
		const diagnostics: unknown[] = [];

		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "database-insert-row",
				blockId: "d1",
				rowId: "row-alpha",
				values: {
					name: "Alpha",
					tags: "todo",
					status: "true",
				},
			},
		]);

		editor.apply([
			{ type: "insert-table-column", blockId: "d1", index: 1 },
			{ type: "delete-table-row", blockId: "d1", index: 0 },
		]);

		const block = editor.getBlock("d1")!;
		expect(block.tableColumns().map((column) => column.id)).toEqual([
			"name",
			"tags",
			"status",
		]);
		expect(block.tableRowCount()).toBe(1);
		expect(block.tableRow(0)?.id).toBe("row-alpha");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_006",
				level: "warn",
				source: "apply",
			}),
		);

		editor.destroy();
	});

	it("database ops manage schema rows and cells through stable ids", () => {
		const editor = databaseEditor();
		const block = editor.getBlock("d1")!;
		const firstViewId = block.databasePrimaryViewId()!;

		editor.apply([
			{
				type: "database-add-column",
				blockId: "d1",
				index: 1,
				viewId: firstViewId,
				column: {
					id: "priority",
					title: "Priority",
					type: "text",
				},
			},
			{
				type: "database-insert-row",
				blockId: "d1",
				rowId: "row-alpha",
				values: {
					name: "Spec review",
					priority: "high",
					status: "true",
				},
			},
			{
				type: "database-update-cell",
				blockId: "d1",
				rowId: "row-alpha",
				columnId: "priority",
				value: "urgent",
			},
			{
				type: "database-update-column",
				blockId: "d1",
				columnId: "priority",
				patch: {
					title: "Urgency",
					width: 220,
				},
			},
			{
				type: "database-convert-column",
				blockId: "d1",
				columnId: "status",
				toType: "select",
			},
		]);

		const updatedBlock = editor.getBlock("d1")!;
		expect(updatedBlock.tableColumns().map((column) => column.id)).toEqual([
			"name",
			"priority",
			"tags",
			"status",
		]);
		expect(updatedBlock.tableColumns()[1]).toEqual(
			expect.objectContaining({
				id: "priority",
				title: "Urgency",
				type: "text",
				width: 220,
			}),
		);
		expect(updatedBlock.tableRowCount()).toBe(1);
		expect(updatedBlock.tableRow(0)?.id).toBe("row-alpha");
		expect(updatedBlock.tableCell(0, 1)?.textContent()).toBe("urgent");
		expect(updatedBlock.tableColumns()[3]?.type).toBe("select");
		expect(updatedBlock.tableCell(0, 3)?.textContent()).toBe("true");
		expect(updatedBlock.databaseActiveView()).toEqual(
			expect.objectContaining({
				columnOrder: ["name", "priority", "tags", "status"],
				visibleColumnIds: ["name", "priority", "tags", "status"],
			}),
		);
		editor.destroy();
	});

	it("database view ops add switch update and remove views", () => {
		const editor = databaseEditor();
		const block = editor.getBlock("d1")!;
		const primaryViewId = block.databasePrimaryViewId()!;
		const columnIds = block.tableColumns().map((column) => column.id);

		editor.apply([
			{
				type: "database-add-view",
				blockId: "d1",
				view: {
					id: "view-list",
					title: "List view",
					type: "list",
					visibleColumnIds: columnIds,
					columnOrder: columnIds,
					sort: [],
					filter: null,
					groupBy: null,
					pageIndex: 0,
					pageSize: 50,
				},
			},
			{
				type: "database-set-active-view",
				blockId: "d1",
				viewId: "view-list",
			},
			{
				type: "database-update-view",
				blockId: "d1",
				viewId: "view-list",
				patch: {
					groupBy: "tags",
				},
			},
		]);

		const updatedBlock = editor.getBlock("d1")!;
		expect(updatedBlock.databasePrimaryViewId()).toBe("view-list");
		expect(updatedBlock.databaseActiveView()).toEqual(
			expect.objectContaining({
				id: "view-list",
				type: "list",
				groupBy: "tags",
			}),
		);
		expect(updatedBlock.databaseViews()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: primaryViewId,
					type: "table",
				}),
				expect.objectContaining({
					id: "view-list",
					title: "List view",
					type: "list",
				}),
			]),
		);

		editor.apply([
			{
				type: "database-remove-view",
				blockId: "d1",
				viewId: "view-list",
			},
		]);

		const nextBlock = editor.getBlock("d1")!;
		expect(nextBlock.databasePrimaryViewId()).toBe(primaryViewId);
		expect(nextBlock.databaseViews()).toHaveLength(1);
		expect(nextBlock.databaseActiveView()).toEqual(
			expect.objectContaining({
				id: primaryViewId,
				type: "table",
			}),
		);
		editor.destroy();
	});

});
