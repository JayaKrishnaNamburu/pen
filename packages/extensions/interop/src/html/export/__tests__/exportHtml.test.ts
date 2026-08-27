import { describe, it, expect } from "vitest";
import { createEditor } from "@input/pen-core";
import { htmlExporter } from "../exporter";
import { defaultSchema } from "@input/pen-schema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function editorWithBlocks(
	ops: Parameters<ReturnType<typeof createEditor>["apply"]>[0],
) {
	const editor = createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
	});
	editor.apply(ops);
	return editor;
}

function editorWithTable(
	insertOp: Parameters<ReturnType<typeof createEditor>["apply"]>[0][0],
	cellOps: Parameters<ReturnType<typeof createEditor>["apply"]>[0],
) {
	const editor = createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
	});
	editor.apply([insertOp]);
	if (cellOps.length > 0) {
		editor.apply(cellOps);
	}
	return editor;
}

function createFlowEditorFromSeededDocument(
	seed: (editor: ReturnType<typeof createEditor>) => void,
) {
	const seedEditor = createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
	});
	seed(seedEditor);

	const document = seedEditor.internals.crdtDoc;
	seedEditor.internals.adapter.setDocumentProfile?.(document, "flow");

	const editor = createEditor({
		schema: defaultSchema,
		document,
		preset: noDefaultExtensionsPreset,
	});
	seedEditor.destroy();
	return editor;
}

describe("@input/pen-interop/html", () => {
	it("exports a heading as HTML", () => {
		const editor = editorWithBlocks([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "heading",
				props: { level: 1 },
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "Hello",
			},
		]);

		const html = htmlExporter.export(editor);
		expect(html).toContain("<h1>");
		expect(html).toContain("Hello");
		expect(html).toContain("</h1>");
		editor.destroy();
	});

	it("exports a paragraph as <p>", () => {
		const editor = editorWithBlocks([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "Hello world",
			},
		]);

		const html = htmlExporter.export(editor);
		expect(html).toContain("<p>");
		expect(html).toContain("Hello world");
		expect(html).toContain("</p>");
		editor.destroy();
	});

	it("escapes HTML entities in text", () => {
		const editor = editorWithBlocks([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: '<script>alert("xss")</script>',
			},
		]);

		const html = htmlExporter.export(editor);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		editor.destroy();
	});

	it("exports bold inline marks", () => {
		const editor = editorWithBlocks([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "hello world",
			},
			{
				type: "format-text",
				blockId: "b1",
				from: 0,
				to: 0 + 5,
				marks: { bold: true },
			},
		]);

		const html = htmlExporter.export(editor);
		expect(html).toContain("<strong>hello</strong>");
		expect(html).toContain(" world");
		editor.destroy();
	});

	it("supports raw and resolved suggestion export for inline content", () => {
		const editor = editorWithBlocks([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "ab",
			},
			{
				type: "format-text",
				blockId: "b1",
				from: 0,
				to: 0 + 1,
				marks: {
					suggestion: { id: "s-insert", action: "insert" },
				},
			},
			{
				type: "format-text",
				blockId: "b1",
				from: 1,
				to: 1 + 1,
				marks: {
					suggestion: { id: "s-delete", action: "delete" },
				},
			},
		]);

		const rawHtml = htmlExporter.export(editor);
		expect(rawHtml).toContain('<ins data-suggestion-id="s-insert">a</ins>');
		expect(rawHtml).toContain('<del data-suggestion-id="s-delete">b</del>');

		const resolvedHtml = htmlExporter.export(editor, {
			includeSuggestions: false,
		});
		expect(resolvedHtml).toContain("<p>a</p>");
		expect(resolvedHtml).not.toContain("<ins");
		expect(resolvedHtml).not.toContain("<del");
		expect(resolvedHtml).not.toContain(">b<");

		editor.destroy();
	});

	it("wraps list items in list containers", () => {
		const editor = editorWithBlocks([
			{
				type: "insert-block",
				blockId: "l1",
				blockType: "bulletListItem",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "l1",
				from: 0,
				to: 0,
				insert: "First",
			},
			{
				type: "insert-block",
				blockId: "l2",
				blockType: "bulletListItem",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "l2",
				from: 0,
				to: 0,
				insert: "Second",
			},
		]);

		const html = htmlExporter.export(editor);
		expect(html).toContain("<ul>");
		expect(html).toContain("<li>First</li>");
		expect(html).toContain("<li>Second</li>");
		editor.destroy();
	});

	it("exports nested layout children via documentState.allBlocks()", () => {
		const editor = editorWithBlocks([
			{
				type: "insert-block",
				blockId: "toggle-1",
				blockType: "toggle",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "child-1",
				blockType: "paragraph",
				props: {},
				position: { parent: "toggle-1", index: 0 },
			},
			{
				type: "splice-text",
				blockId: "child-1",
				from: 0,
				to: 0,
				insert: "Nested child",
			},
		]);

		const html = htmlExporter.export(editor);
		expect(html).toContain("Nested child");
		editor.destroy();
	});

	it("has correct metadata", () => {
		expect(htmlExporter.name).toBe("html");
		expect(htmlExporter.mimeType).toBe("text/html");
		expect(htmlExporter.fileExtension).toBe(".html");
	});

	it("exports a table block as HTML table", () => {
		const editor = editorWithTable(
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: { hasHeaderRow: true },
				position: "last",
			},
			[
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 0,
					insert: "Name",
				},
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 0, col: 1 },
					from: 0,
					to: 0,
					insert: "Age",
				},
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 1, col: 0 },
					from: 0,
					to: 0,
					insert: "Alice",
				},
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 1, col: 1 },
					from: 0,
					to: 0,
					insert: "30",
				},
			],
		);

		const html = htmlExporter.export(editor);
		expect(html).toContain("<table>");
		expect(html).toContain("<thead>");
		expect(html).toContain("<th>Name</th>");
		expect(html).toContain("<th>Age</th>");
		expect(html).toContain("<tbody>");
		expect(html).toContain("<td>Alice</td>");
		expect(html).toContain("<td>30</td>");
		expect(html).toContain("</table>");
		editor.destroy();
	});

	it("exports a table without header row (no thead)", () => {
		const editor = editorWithTable(
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: { hasHeaderRow: false },
				position: "last",
			},
			[
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 0,
					insert: "A",
				},
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 1, col: 0 },
					from: 0,
					to: 0,
					insert: "B",
				},
			],
		);

		const html = htmlExporter.export(editor);
		expect(html).not.toContain("<thead>");
		expect(html).toContain("<tbody>");
		expect(html).toContain("<td>A</td>");
		expect(html).toContain("<td>B</td>");
		editor.destroy();
	});

	it("escapes HTML entities in table cells", () => {
		const editor = editorWithTable(
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: { hasHeaderRow: false },
				position: "last",
			},
			[
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 0,
					insert: "<script>",
				},
			],
		);

		const html = htmlExporter.export(editor);
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>");
		editor.destroy();
	});

	it("preserves inline formatting inside table cells", () => {
		const editor = editorWithTable(
			{
				type: "insert-block",
				blockId: "t2",
				blockType: "table",
				props: { hasHeaderRow: false },
				position: "last",
			},
			[
				{
					type: "splice-text",
					blockId: "t2",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 0,
					insert: "Alpha",
				},
				{
					type: "format-text",
					blockId: "t2",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 5,
					marks: { bold: true },
				},
			],
		);

		const html = htmlExporter.export(editor);
		expect(html).toContain("<strong>Alpha</strong>");
		editor.destroy();
	});
});
