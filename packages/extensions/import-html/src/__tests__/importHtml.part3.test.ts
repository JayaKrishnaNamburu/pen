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
	it("server-side parsing produces identical blocks as browser-side for same input (AC 43)", () => {
		const inputs = [
			"<h1>Title</h1><p>Body</p>",
			"<ul><li>a</li><li>b</li></ul>",
			'<pre><code class="language-js">const x = 1;</code></pre>',
			"<hr />",
			'<img src="url" alt="text" />',
			"<p><strong>bold</strong> and <em>italic</em></p>",
		];

		for (const html of inputs) {
			const sanitized = sanitizeHTML(html);
			const dom = parseHTML(sanitized);
			const blocks = domToBlocks(dom, stubRegistry);

			expect(blocks.length).toBeGreaterThan(0);
			for (const block of blocks) {
				expect(block.type).toBeTruthy();
				expect(block.props).toBeDefined();
			}
		}
	});

	it("<details> → toggle block via schema fromHTML", () => {
		const blocks = convert(
			"<details><summary>Toggle title</summary></details>",
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "toggle",
			props: { open: false },
			content: "Toggle title",
		});
	});

	it("passes the public HTML import element to schema fromHTML hooks", () => {
		let receivedElement: HTMLImportElement | null = null;
		const registry: SchemaRegistry = {
			...stubRegistry,
			allBlocks: () => [{
				type: "custom",
				propSchema: {},
				content: "inline",
				serialize: {
					fromHTML(element: HTMLImportElement) {
						receivedElement = element;
						if (element.tagName !== "div") {
							return null;
						}
						return {
							type: "paragraph",
							props: {},
							content: element.getAttribute("data-title") ?? "",
						};
					},
				},
			}],
			resolve: (type) => (type === "custom" ? registry.allBlocks()[0] : null),
		};

		const blocks = convert('<div data-title="From hook"></div>', registry);

		expect(receivedElement).toMatchObject({
			type: "element",
			tagName: "div",
			attributes: { "data-title": "From hook" },
		});
		if (!receivedElement) {
			throw new Error("Expected schema fromHTML hook to receive an element");
		}
		const hookElement = receivedElement as unknown as HTMLImportElement;
		expect(hookElement.getAttribute("data-title")).toBe("From hook");
		expect(hookElement.hasAttribute("data-title")).toBe(true);
		expect(blocks).toMatchObject([
			{
				type: "paragraph",
				content: "From hook",
			},
		]);
	});

	it("<details open> → toggle block with open=true", () => {
		const blocks = convert(
			'<details open><summary>Open toggle</summary></details>',
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "toggle",
			props: { open: true },
			content: "Open toggle",
		});
	});

	it("preserves inline formatting inside an HTML toggle summary", () => {
		const blocks = convert(
			"<details><summary><strong>Bold</strong> and <em>italic</em></summary></details>",
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "toggle",
			content: "Bold and italic",
		});
		expect(blocks[0].marks?.some((mark) => mark.type === "bold")).toBe(true);
		expect(blocks[0].marks?.some((mark) => mark.type === "italic")).toBe(true);
	});

	it("<div class='callout callout-warning'> → callout block", () => {
		const blocks = convert(
			'<div class="callout callout-warning">Be careful</div>',
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "callout",
			props: { type: "warning" },
			content: "Be careful",
		});
	});

	it("<div class='callout callout-error'> → callout block", () => {
		const blocks = convert(
			'<div class="callout callout-error">Something failed</div>',
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "callout",
			props: { type: "error" },
			content: "Something failed",
		});
	});

	it("<div class='callout callout-info'> → callout block", () => {
		const blocks = convert(
			'<div class="callout callout-info">FYI</div>',
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "callout",
			props: { type: "info" },
			content: "FYI",
		});
	});

	it("<ol start='5'> preserves start value on first list item", () => {
		const blocks = convert('<ol start="5"><li>fifth</li><li>sixth</li></ol>');

		expect(blocks).toHaveLength(2);
		expect(blocks[0]).toMatchObject({
			type: "numberedListItem",
			content: "fifth",
			props: { indent: 0, start: 5 },
		});
		expect(blocks[1]).toMatchObject({
			type: "numberedListItem",
			content: "sixth",
			props: { indent: 0 },
		});
	});

	it("<ol> without start attribute does not set start", () => {
		const blocks = convert("<ol><li>first</li></ol>");

		expect(blocks).toHaveLength(1);
		expect(blocks[0].props.start).toBeUndefined();
	});

	it("keeps parseHtmlToBlocks parse-only in flow documents", () => {
		const source = databaseEditor();
		const html = htmlExporter.export(source);
		const editor = createEditor({
			schema: defaultRegistry,
			documentProfile: "flow",
			preset: noDefaultExtensionsPreset,
		});

		const blocks = parseHtmlToBlocks(`${html}<h2>Allowed</h2>`, editor);

		expect(blocks.some((block) => block.type === "database")).toBe(true);
		expect(blocks.some((block) => block.type === "heading")).toBe(true);

		source.destroy();
		editor.destroy();
	});

  it("does not emit normalization diagnostics during parseHtmlToBlocks", () => {
    const source = databaseEditor();
    const html = htmlExporter.export(source);
    const editor = createEditor({
      schema: defaultRegistry,
      documentProfile: "flow",
      preset: noDefaultExtensionsPreset,
    });
    const diagnostics: unknown[] = [];

    editor.on("diagnostic", (event) => {
      diagnostics.push(event);
    });

    parseHtmlToBlocks(`${html}<h2>Allowed</h2>`, editor);

    expect(diagnostics).toEqual([]);

    source.destroy();
    editor.destroy();
  });

	it("filters flow-disallowed blocks during direct HTML import into flow documents", async () => {
		const source = databaseEditor();
		const html = htmlExporter.export(source);
		const editor = createEditor({
			schema: defaultRegistry,
			documentProfile: "flow",
			preset: noDefaultExtensionsPreset,
		});

		await htmlImporter.import(`${html}<h2>Allowed</h2>`, editor);

		const blockOrder = editor.documentState.blockOrder;
		expect(
			blockOrder.some((blockId) => editor.getBlock(blockId)?.type === "heading"),
		).toBe(true);
		expect(
			blockOrder.some((blockId) => editor.getBlock(blockId)?.type === "database"),
		).toBe(false);

		source.destroy();
		editor.destroy();
	});

  it("returns a structured import result for HTML imports with normalization", async () => {
    const source = databaseEditor();
    const html = htmlExporter.export(source);
    const editor = createEditor({
      schema: defaultRegistry,
      documentProfile: "flow",
      preset: noDefaultExtensionsPreset,
    });

    const result = await htmlImporter.import(`${html}<h2>Allowed</h2>`, editor);

    expect(result).toEqual({
      parsedTopLevelBlockCount: 3,
      importedTopLevelBlockCount: 2,
      droppedBlockCount: 1,
      droppedBlockTypes: ["database"],
      normalized: true,
    });

    source.destroy();
    editor.destroy();
  });
});
