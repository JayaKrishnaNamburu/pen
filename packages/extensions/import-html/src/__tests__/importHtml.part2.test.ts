import { describe, it, expect } from "vitest";
import { blocksToOps, createEditor } from "@pen/core";
import type { HTMLImportElement, SchemaRegistry } from "@pen/types";
import { createDefaultSchema } from "@pen/schema-default";
import { htmlExporter } from "@pen/export-html";
import { htmlImporter, parseHtmlToBlocks } from "../importer";
import { sanitizeHTML } from "../sanitize";
import { parseHTML } from "../domAdapter";
import { domToBlocks } from "../domToBlocks";
import { parseInlineContent } from "../inlineParser";
import type { DOMNode } from "../domAdapter";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const stubRegistry: SchemaRegistry = {
	resolve: () => null,
	resolveInline: () => null,
	resolveApp: () => null,
	resolveLayout: () => null,
	allBlocks: () => [],
	allInlines: () => [],
	allApps: () => [],
	allBlockDisplays: () => [],
};

const defaultRegistry = createDefaultSchema();

function convert(html: string, registry: SchemaRegistry = stubRegistry) {
	const sanitized = sanitizeHTML(html);
	const dom = parseHTML(sanitized);
	return domToBlocks(dom, registry);
}

function databaseEditor() {
	const editor = createEditor({
		schema: defaultRegistry,
		preset: noDefaultExtensionsPreset,
	});
	editor.apply([{
		type: "insert-block",
		blockId: "d1",
		blockType: "database",
		props: { title: "Roadmap", dataSource: "local" },
		position: "last",
	}]);
	editor.apply([{
		type: "update-table-columns",
		blockId: "d1",
		columns: [
			{ id: "name", title: "Name", type: "text" },
			{
				id: "tags",
				title: "Tags",
				type: "multiSelect",
				options: [
					{ id: "bug", value: "Bug", color: "red" },
					{ id: "feature", value: "Feature", color: "blue" },
				],
			},
			{ id: "done", title: "Done", type: "checkbox" },
		],
	}]);
	editor.apply([{
		type: "database-insert-row",
		blockId: "d1",
		rowId: "roadmap-1",
		values: {
			name: "Ship importer",
			tags: JSON.stringify(["Feature"]),
			done: "false",
		},
	}]);
	editor.apply([{
		type: "database-update-view",
		blockId: "d1",
		patch: {
			title: "Main",
			type: "table",
			visibleColumnIds: ["name", "tags"],
			columnOrder: ["name", "tags", "done"],
			sort: [{ columnId: "name", direction: "asc" }],
		},
	}]);
	return editor;
}

describe("@pen/import-html dom-to-blocks", () => {
	it("heading + paragraph (AC 28)", () => {
		const blocks = convert("<h1>Title</h1><p>Body</p>");

		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toMatchObject({
			type: "heading",
			props: { level: 1 },
			content: "Title",
		});
		expect(blocks[1]).toMatchObject({
			type: "paragraph",
			content: "Body",
		});
	});

	it("script tag is stripped (AC 29)", () => {
		const blocks = convert('<script>alert("xss")</script><p>safe</p>');

		const types = blocks.map((b) => b.type);
		expect(types).not.toContain("script");
		expect(blocks.some((b) => b.content === "safe")).toBe(true);
	});

	it("event handler stripped, text preserved (AC 30)", () => {
		const blocks = convert('<div onclick="alert(1)">text</div>');

		expect(blocks.length).toBeGreaterThanOrEqual(1);
		const hasText = blocks.some(
			(b) => b.content?.includes("text"),
		);
		expect(hasText).toBe(true);
	});

	it("bold mark from <strong> (AC 32)", () => {
		const blocks = convert("<p><strong>bold</strong></p>");

		expect(blocks).toHaveLength(1);
		expect(blocks[0].content).toBe("bold");
		expect(blocks[0].marks?.some((m) => m.type === "bold")).toBe(true);
	});

	it("italic mark from <em> (AC 33)", () => {
		const blocks = convert("<p><em>italic</em></p>");

		expect(blocks).toHaveLength(1);
		expect(blocks[0].content).toBe("italic");
		expect(blocks[0].marks?.some((m) => m.type === "italic")).toBe(true);
	});

	it("link mark with href (AC 34)", () => {
		const blocks = convert('<p><a href="https://example.com">text</a></p>');

		expect(blocks).toHaveLength(1);
		expect(blocks[0].content).toBe("text");
		const linkMark = blocks[0].marks?.find((m) => m.type === "link");
		expect(linkMark).toBeDefined();
		expect(linkMark!.props!.href).toBe("https://example.com");
	});

	it("bullet list items (AC 35)", () => {
		const blocks = convert("<ul><li>a</li><li>b</li></ul>");

		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toMatchObject({
			type: "bulletListItem",
			content: "a",
		});
		expect(blocks[1]).toMatchObject({
			type: "bulletListItem",
			content: "b",
		});
	});

	it("numbered list items (AC 36)", () => {
		const blocks = convert("<ol><li>a</li><li>b</li></ol>");

		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toMatchObject({
			type: "numberedListItem",
			content: "a",
		});
		expect(blocks[1]).toMatchObject({
			type: "numberedListItem",
			content: "b",
		});
	});

	it("nested list with indent (AC 37)", () => {
		const blocks = convert(
			"<ul><li>a<ul><li>b</li></ul></li></ul>",
		);

		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toMatchObject({
			type: "bulletListItem",
			content: "a",
			props: { indent: 0 },
		});
		expect(blocks[1]).toMatchObject({
			type: "bulletListItem",
			content: "b",
			props: { indent: 1 },
		});
	});

	it("code block with language (AC 38)", () => {
		const blocks = convert(
			'<pre><code class="language-js">const x = 1;</code></pre>',
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "codeBlock",
			props: { language: "js" },
			content: "const x = 1;",
		});
	});

	it("hr → divider (AC 39)", () => {
		const blocks = convert("<hr />");

		expect(blocks).toHaveLength(1);
		expect(blocks[0].type).toBe("divider");
	});

	it("image with props (AC 40)", () => {
		const blocks = convert('<img src="url" alt="text" title="cap" />');

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "image",
			props: { src: "url", alt: "text", caption: "cap" },
		});
	});

	it("heading levels 1-6", () => {
		const blocks = convert(
			"<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>",
		);

		expect(blocks).toHaveLength(6);
		for (let i = 0; i < 6; i++) {
			expect(blocks[i].type).toBe("heading");
			expect(blocks[i].props.level).toBe(i + 1);
		}
	});

	it("div content is unwrapped (block container)", () => {
		const blocks = convert("<div><p>inner</p></div>");

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "paragraph",
			content: "inner",
		});
	});

	it("table with header (AC 40 extension)", () => {
		const blocks = convert(
			"<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0].type).toBe("table");
		expect(blocks[0].props.hasHeaderRow).toBe(true);
		expect(blocks[0].children).toHaveLength(2);
	});

	it("round-trips exported database HTML back into a database block", async () => {
		const source = databaseEditor();
		const html = await htmlExporter.export(source);

		const blocks = convert(html, defaultRegistry);
		const databaseBlock = blocks.find((block) => block.type === "database");
		expect(databaseBlock).toMatchObject({
			type: "database",
			props: { title: "Roadmap", dataSource: "local" },
		});
		expect(databaseBlock?.database).toEqual(
			expect.objectContaining({
				primaryViewId: expect.any(String),
				columns: [
					expect.objectContaining({ id: "name", title: "Name", type: "text" }),
					expect.objectContaining({ id: "tags", title: "Tags", type: "multiSelect" }),
					expect.objectContaining({ id: "done", title: "Done", type: "checkbox" }),
				],
				rows: expect.arrayContaining([
					expect.objectContaining({
						id: expect.any(String),
						values: {
							name: "Ship importer",
							tags: JSON.stringify(["feature"]),
							done: "false",
						},
					}),
				]),
			}),
		);

		const target = createEditor({
			schema: defaultRegistry,
			preset: noDefaultExtensionsPreset,
		});
		const ops = blocksToOps(blocks);
		target.apply(ops, { origin: "import", undoGroup: true });
		const imported = Array.from(target.documentState.allBlocks()).find(
			(block) => block.type === "database",
		);
		expect(imported?.props.title).toBe("Roadmap");
		expect(imported?.tableColumns().map((column) => column.id)).toEqual(["name", "tags", "done"]);
		expect(imported?.tableRow(0)?.id).toEqual(expect.any(String));
		expect(imported?.tableCell(0, 1)?.textContent()).toBe(JSON.stringify(["feature"]));
		expect(imported?.databaseActiveView()).toEqual(
			expect.objectContaining({
				title: "Main",
				visibleColumnIds: ["name", "tags"],
				columnOrder: ["name", "tags", "done"],
			}),
		);

		source.destroy();
		target.destroy();
	});

	it("preserves intentionally empty database rows when round-tripping HTML", async () => {
		const source = databaseEditor();
		source.apply([{
			type: "database-insert-row",
			blockId: "d1",
			rowId: "empty-row",
		}]);
		const html = await htmlExporter.export(source);

		const blocks = convert(html, defaultRegistry);
		const databaseBlock = blocks.find((block) => block.type === "database");
		expect(databaseBlock?.database?.rows).toEqual([
			expect.objectContaining({
				values: {
					name: "Ship importer",
					tags: JSON.stringify(["feature"]),
					done: "false",
				},
			}),
			{
				id: "empty-row",
				values: {
					name: "",
					tags: "",
					done: "",
				},
			},
		]);

		const target = createEditor({
			schema: defaultRegistry,
			preset: noDefaultExtensionsPreset,
		});
		target.apply(blocksToOps(blocks), { origin: "import", undoGroup: true });

		const imported = Array.from(target.documentState.allBlocks()).find(
			(block) => block.type === "database",
		);
		expect(imported?.tableRowCount()).toBe(2);
		expect(imported?.tableRow(1)?.id).toBe("empty-row");
		expect(imported?.tableCell(1, 0)?.textContent()).toBe("");
		expect(imported?.tableCell(1, 1)?.textContent()).toBe("");
		expect(imported?.tableCell(1, 2)?.textContent()).toBe("");

		source.destroy();
		target.destroy();
	});

	it("imports typed HTML tables as database blocks without Pen payload", () => {
		const blocks = convert(
			'<table><thead><tr><th data-col-id="name" data-col-type="text">Name</th><th data-col-id="status" data-col-type="select" data-col-options="%5B%7B%22id%22%3A%22todo%22%2C%22value%22%3A%22Todo%22%7D%5D">Status</th></tr></thead><tbody><tr><td>Ship it</td><td>todo</td></tr></tbody></table>',
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "database",
			props: { title: "Untitled", dataSource: "local" },
			database: {
				columns: [
					expect.objectContaining({ id: "name", title: "Name", type: "text" }),
					expect.objectContaining({
						id: "status",
						title: "Status",
						type: "select",
						options: [{ id: "todo", value: "Todo" }],
					}),
				],
				rows: [
					expect.objectContaining({
						values: { name: "Ship it", status: "todo" },
					}),
				],
			},
		});
	});

	it("coerces select labels to option IDs during typed HTML import", () => {
		const blocks = convert(
			'<table><thead><tr><th data-col-id="name" data-col-type="text">Name</th><th data-col-id="status" data-col-type="select" data-col-options="%5B%7B%22id%22%3A%22todo%22%2C%22value%22%3A%22Todo%22%7D%2C%7B%22id%22%3A%22done%22%2C%22value%22%3A%22Done%22%7D%5D">Status</th></tr></thead><tbody><tr><td>Task A</td><td>Todo</td></tr><tr><td>Task B</td><td>done</td></tr></tbody></table>',
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		const rows = blocks[0].database!.rows;
		expect(rows[0].values.status).toBe("todo");
		expect(rows[1].values.status).toBe("done");
	});

	it("coerces multiSelect labels to option IDs during typed HTML import", () => {
		const blocks = convert(
			'<table><thead><tr><th data-col-id="tags" data-col-type="multiSelect" data-col-options="%5B%7B%22id%22%3A%22bug%22%2C%22value%22%3A%22Bug%22%7D%2C%7B%22id%22%3A%22feat%22%2C%22value%22%3A%22Feature%22%7D%5D">Tags</th></tr></thead><tbody><tr><td>Bug, Feature</td></tr></tbody></table>',
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		const rows = blocks[0].database!.rows;
		expect(rows[0].values.tags).toBe(JSON.stringify(["bug", "feat"]));
	});

	it("preserves hidden and readonly false values during typed HTML import", () => {
		const blocks = convert(
			'<table><thead><tr><th data-col-id="a" data-col-type="text" data-col-hidden="false" data-col-readonly="false">A</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>',
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		const col = blocks[0].database!.columns[0];
		expect(col.hidden).toBe(false);
		expect(col.readonly).toBe(false);
	});

	it("blocksToOps generates correct ops (AC 41)", () => {
		const blocks = convert("<h1>Title</h1><p><strong>bold</strong></p>");
		const ops = blocksToOps(blocks);

		const insertBlocks = ops.filter((o) => o.type === "insert-block");
		expect(insertBlocks).toHaveLength(2);

		const formatTexts = ops.filter((o) => o.type === "format-text");
		expect(formatTexts.length).toBeGreaterThan(0);
		expect(formatTexts[0].marks).toHaveProperty("bold");
	});

	it("inline-only at block level wraps in paragraph", () => {
		const dom = parseHTML("<strong>bold at root</strong>");
		const blocks = domToBlocks(dom, stubRegistry);

		expect(blocks.some((b) => b.type === "paragraph" && b.content?.includes("bold at root"))).toBe(true);
	});

});
