import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import { serializeEditorState } from "./editorState";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createPlaygroundEditor() {
	return createEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
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

		expect(state.generation).toBe(editor.documentState.generation);
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

	it("serializes tables", () => {
		const editor = createPlaygroundEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "table-1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "update-table-columns",
				blockId: "table-1",
				columns: [
					{ id: "name", title: "Name", type: "text" },
					{ id: "status", title: "Status", type: "text" },
				],
			},
			{
				type: "insert-table-cell-text",
				blockId: "table-1",
				row: 0,
				col: 0,
				offset: 0,
				text: "Alice",
			},
			{
				type: "insert-table-cell-text",
				blockId: "table-1",
				row: 0,
				col: 1,
				offset: 0,
				text: "Active",
			},
		]);

		const state = serializeEditorState(editor);
		const tableBlock = state.blocks.find((block) => block.id === "table-1");

		expect(state.generation).toBe(editor.documentState.generation);
		expect(tableBlock).toMatchObject({
			type: "table",
			table: {
				columnCount: 2,
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
