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

describe("sanitizeHTML", () => {
	it("strips <script> tags (AC 29, 42)", () => {
		const result = sanitizeHTML('<p>safe</p><script>alert("xss")</script>');
		expect(result).not.toContain("script");
		expect(result).toContain("safe");
	});

	it("strips <style> tags (AC 42)", () => {
		const result = sanitizeHTML("<p>text</p><style>body{color:red}</style>");
		expect(result).not.toContain("style>");
		expect(result).toContain("text");
	});

	it("strips <iframe> tags (AC 42)", () => {
		const result = sanitizeHTML('<iframe src="evil.com"></iframe><p>ok</p>');
		expect(result).not.toContain("iframe");
		expect(result).toContain("ok");
	});

	it("strips event handler attributes (AC 42)", () => {
		const result = sanitizeHTML('<div onclick="alert(1)">text</div>');
		expect(result).not.toContain("onclick");
		expect(result).toContain("text");
	});

	it("handles javascript: URLs (AC 31)", () => {
		const result = sanitizeHTML('<a href="javascript:void(0)">link</a>');
		expect(result).not.toContain("javascript:");
	});

	it("preserves allowed tags", () => {
		const result = sanitizeHTML("<p><strong>bold</strong></p>");
		expect(result).toContain("<strong>");
		expect(result).toContain("bold");
	});

	it("preserves img with allowed attributes", () => {
		const result = sanitizeHTML('<img src="photo.jpg" alt="photo" />');
		expect(result).toContain("src");
		expect(result).toContain("alt");
	});

	it("only preserves the inline styles the importer understands", () => {
		const result = sanitizeHTML(
			'<p style="color: red; position: fixed; background-color: blue; z-index: 1">styled</p>',
		);
		expect(result).toContain('style="color: red; background-color: blue"');
		expect(result).not.toContain("position:");
		expect(result).not.toContain("z-index:");
	});
});
describe("parseInlineContent", () => {
	it("extracts text from text nodes", () => {
		const node: DOMNode = { type: "text", textContent: "hello" };
		const result = parseInlineContent(node);
		expect(result.text).toBe("hello");
		expect(result.marks).toHaveLength(0);
	});

	it("extracts bold mark", () => {
		const node: DOMNode = {
			type: "element",
			tagName: "strong",
			children: [{ type: "text", textContent: "bold" }],
		};
		const result = parseInlineContent(node);
		expect(result.text).toBe("bold");
		expect(result.marks).toHaveLength(1);
		expect(result.marks[0]).toMatchObject({
			type: "bold",
			start: 0,
			end: 4,
		});
	});

	it("extracts link mark with href", () => {
		const node: DOMNode = {
			type: "element",
			tagName: "a",
			attributes: { href: "https://example.com", title: "Example" },
			children: [{ type: "text", textContent: "link" }],
		};
		const result = parseInlineContent(node);
		expect(result.text).toBe("link");
		expect(result.marks[0]).toMatchObject({
			type: "link",
			props: { href: "https://example.com", title: "Example" },
		});
	});

	it("handles nested marks", () => {
		const node: DOMNode = {
			type: "element",
			tagName: "strong",
			children: [
				{
					type: "element",
					tagName: "em",
					children: [{ type: "text", textContent: "both" }],
				},
			],
		};
		const result = parseInlineContent(node);
		expect(result.text).toBe("both");
		expect(result.marks).toHaveLength(2);
		expect(result.marks.some((m) => m.type === "bold")).toBe(true);
		expect(result.marks.some((m) => m.type === "italic")).toBe(true);
	});
});
