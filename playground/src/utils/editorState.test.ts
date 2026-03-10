import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import { createDefaultSchema } from "@pen/schema-default";
import { serializeEditorState } from "./editorState";

function createPlaygroundEditor() {
	return createEditor({
		schema: createDefaultSchema(),
		without: ["document-ops", "delta-stream", "undo"],
	});
}

describe("playground editor state serialization", () => {
	it("serializes nested child blocks under their parent block", () => {
		const editor = createPlaygroundEditor();
		const parentId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "convert-block",
				blockId: parentId,
				newType: "toggle",
				newProps: { open: true },
			},
			{
				type: "insert-text",
				blockId: parentId,
				offset: 0,
				text: "Parent",
			},
			{
				type: "insert-block",
				blockId: "child-1",
				blockType: "paragraph",
				props: {},
				position: { after: parentId },
			},
			{
				type: "update-block",
				blockId: "child-1",
				props: { parentId },
			},
			{
				type: "insert-text",
				blockId: "child-1",
				offset: 0,
				text: "Nested child",
			},
		]);

		const state = serializeEditorState(editor);

		expect(state.blockCount).toBe(2);
		expect(state.blocks).toHaveLength(1);
		expect(state.blocks[0]).toMatchObject({
			id: parentId,
			type: "toggle",
			text: "Parent",
			children: [
				{
					id: "child-1",
					type: "paragraph",
					text: "Nested child",
				},
			],
		});

		editor.destroy();
	});

	it("serializes database tables", () => {
		const editor = createPlaygroundEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "db-1",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "update-table-columns",
				blockId: "db-1",
				columns: [
					{ id: "name", title: "Name", type: "text" },
					{ id: "status", title: "Status", type: "text" },
				],
			},
			{
				type: "insert-table-row",
				blockId: "db-1",
				index: 0,
			},
			{
				type: "insert-table-column",
				blockId: "db-1",
				index: 1,
			},
			{
				type: "insert-table-cell-text",
				blockId: "db-1",
				row: 0,
				col: 0,
				offset: 0,
				text: "Alice",
			},
			{
				type: "insert-table-cell-text",
				blockId: "db-1",
				row: 0,
				col: 1,
				offset: 0,
				text: "Active",
			},
		]);

		const state = serializeEditorState(editor);
		const databaseBlock = state.blocks.find((block) => block.id === "db-1");

		expect(databaseBlock).toMatchObject({
			type: "database",
			table: {
				columnCount: 2,
				rowCount: 1,
				columns: [
					{ id: "name", title: "Name", type: "text" },
					{ id: "status", title: "Status", type: "text" },
				],
				rows: [
					{
						index: 0,
						cells: [
							{ row: 0, col: 0, text: "Alice" },
							{ row: 0, col: 1, text: "Active" },
						],
					},
				],
			},
		});

		editor.destroy();
	});
});
