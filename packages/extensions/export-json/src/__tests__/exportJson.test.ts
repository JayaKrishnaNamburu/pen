import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { jsonExporter } from "../exporter";
import { defaultSchema } from "@input/pen-schema-default";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function editorWithOps(
	ops: Parameters<ReturnType<typeof createEditor>["apply"]>[0],
) {
	const editor = createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
	});
	const existingBlockIds = [...editor.documentState.allBlocks()]
		.filter((handle) => handle.parent === null)
		.map((handle) => handle.id);
	if (existingBlockIds.length > 0) {
		editor.apply(
			existingBlockIds.reverse().map((blockId) => ({
				type: "delete-block" as const,
				blockId,
			})),
		);
	}
	editor.apply(ops);
	return editor;
}

describe("@input/pen-export-json", () => {
	it("exports nested blocks and inline marks", async () => {
		const editor = editorWithOps([
			{
				type: "insert-block",
				blockId: "parent",
				blockType: "toggle",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "child",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "set-props",
				blockId: "child",
				props: { parentId: "parent" },
			},
			{
				type: "splice-text",
				blockId: "child",
				from: 0,
				to: 0,
				insert: "hello world",
			},
			{
				type: "format-text",
				blockId: "child",
				from: 0,
				to: 5,
				marks: { bold: true },
			},
		]);

		const json = await jsonExporter.export(editor);

		expect(json.blocks).toHaveLength(1);
		expect(json.blocks[0]).toMatchObject({
			id: "parent",
			type: "toggle",
			children: [
				{
					id: "child",
					type: "paragraph",
					content: {
						text: "hello world",
					},
				},
			],
		});
		expect(json.blocks[0]?.children?.[0]?.content?.marks).toEqual([
			{
				type: "bold",
				start: 0,
				end: 5,
			},
		]);

		editor.destroy();
	});

	it("exports inline node segments without dropping canonical text content", async () => {
		const editor = editorWithOps([
			{
				type: "insert-block",
				blockId: "paragraph-1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "paragraph-1",
				from: 0,
				to: 0,
				insert: "Hello ",
			},
			{
				type: "splice-text",
				blockId: "paragraph-1",
				from: 6,
				to: 6,
				insert: {
					nodeType: "mention",
					props: {
						id: "user-1",
						label: "Ada",
					},
				},
			},
			{
				type: "splice-text",
				blockId: "paragraph-1",
				from: 7,
				to: 7,
				insert: " world",
			},
		]);

		const json = await jsonExporter.export(editor);
		const content = json.blocks[0]?.content;

		expect(content?.text).toBe("Hello  world");
		expect(content?.segments).toEqual([
			{ type: "text", text: "Hello " },
			{
				type: "node",
				nodeType: "mention",
				props: {
					id: "user-1",
					label: "Ada",
				},
			},
			{ type: "text", text: " world" },
		]);

		editor.destroy();
	});

	it("exports table cell text and marks through synthetic table children", async () => {
		const editor = editorWithOps([
			{
				type: "insert-block",
				blockId: "table-1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "table-1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 0,
				insert: "bold",
			},
			{
				type: "format-text",
				blockId: "table-1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 4,
				marks: { bold: true },
			},
		]);

		const json = await jsonExporter.export(editor);
		const firstCell = json.blocks[0]?.children?.[0]?.children?.[0];

		expect(json.blocks[0]?.type).toBe("table");
		expect(firstCell?.type).toBe("__table_cell");
		expect(firstCell?.content?.text).toBe("bold");
		expect(firstCell?.content?.marks).toEqual([
			{
				type: "bold",
				start: 0,
				end: 4,
			},
		]);

		editor.destroy();
	});
});
