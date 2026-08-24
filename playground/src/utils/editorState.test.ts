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
				type: "set-props", blockId: parentId, props: { type: "toggle", ...{ open: true  }},
			},
			{
				type: "splice-text",
				blockId: parentId,
				from: 0,
				to: 0,
				insert: "Parent",
			},
			{
				type: "insert-block",
				blockId: "child-1",
				blockType: "paragraph",
				props: {},
				position: { after: parentId },
			},
			{
				type: "set-props",
				blockId: "child-1",
				props: { parentId },
			},
			{
				type: "splice-text",
				blockId: "child-1",
				from: 0,
				to: 0,
				insert: "Nested child",
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
				type: "set-props",
				blockId: "table-1",
				props: {
					columns: [
						{ id: "name", title: "Name", type: "text" },
						{ id: "status", title: "Status", type: "text" },
					],
				},
			},
			{
				type: "splice-text",
				blockId: "table-1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 0,
				insert: "Alice",
			},
			{
				type: "splice-text",
				blockId: "table-1",
				cell: { row: 0, col: 1 },
				from: 0,
				to: 0,
				insert: "Active",
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
