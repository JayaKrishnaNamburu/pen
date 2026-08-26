import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { xmlExporter } from "../exporter";
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

describe("@input/pen-interop/xml", () => {
	it("exports nested blocks and marks as XML", async () => {
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
				position: { parent: "parent", index: 0 },
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

		const xml = await xmlExporter.export(editor);
		const parentStart = xml.indexOf('<block id="parent"');
		const childrenStart = xml.indexOf("<children>", parentStart);
		const childStart = xml.indexOf('<block id="child"', childrenStart);

		expect(xml).toContain('<pen-document version="1">');
		expect(xml).toContain('<block id="parent" type="toggle">');
		expect(childrenStart).toBeGreaterThan(parentStart);
		expect(childStart).toBeGreaterThan(childrenStart);
		expect(xml).toContain("<content>hello world</content>");
		expect(xml).toContain('<mark type="bold" start="0" end="5" />');

		editor.destroy();
	});

	it("exports inline node segments as explicit XML content runs", async () => {
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
					props: { id: "user-1", label: "Ada" },
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

		const xml = await xmlExporter.export(editor);

		expect(xml).toContain("<segments>");
		expect(xml).toContain("<text>Hello </text>");
		expect(xml).toContain(
			'<node type="mention" props="{&quot;id&quot;:&quot;user-1&quot;,&quot;label&quot;:&quot;Ada&quot;}" />',
		);
		expect(xml).toContain("<text> world</text>");

		editor.destroy();
	});

	it("exports table content using stable synthetic row and cell ids", async () => {
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
				insert: "A1",
			},
		]);

		const xml = await xmlExporter.export(editor);

		expect(xml).toContain('<block id="table-1" type="table">');
		expect(xml).toContain('<block id="row-0" type="__table_row">');
		expect(xml).toContain('<block id="cell-0-0" type="__table_cell">');
		expect(xml).toContain("<content>A1</content>");

		editor.destroy();
	});
});
