import { describe, it, expect } from "vitest";
import { blocksToOps, createEditor } from "@pen/core";
import type { SchemaRegistry } from "@pen/types";
import { markdownExporter } from "@pen/export-markdown";
import { createDefaultSchema } from "@pen/schema-default";
import { markdownImporter, parseMarkdownToBlocks } from "../importer";

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

function convert(md: string, registry: SchemaRegistry = stubRegistry) {
	return parseMarkdownToBlocks(md, {
		schema: registry,
	} as never);
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

describe("@pen/import-markdown", () => {
	it("preserves inline formatting after a markdown callout prefix", () => {
		const blocks = convert(
			"> **Note:** This is *very* [important](https://example.com)",
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "callout",
			props: { type: "info" },
			content: "This is very important",
		});

		const italicMark = blocks[0].marks?.find((mark) => mark.type === "italic");
		expect(italicMark).toMatchObject({ start: 8, end: 12 });

		const linkMark = blocks[0].marks?.find((mark) => mark.type === "link");
		expect(linkMark).toMatchObject({
			start: 13,
			end: 22,
			props: { href: "https://example.com" },
		});
	});

	it("preserves inline formatting inside a toggle summary HTML block", () => {
		const blocks = convert(
			"<details><summary><em>Very</em> <a href=\"https://example.com\">important</a></summary></details>",
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "toggle",
			props: { open: false },
			content: "Very important",
		});

		const italicMark = blocks[0].marks?.find((mark) => mark.type === "italic");
		expect(italicMark).toMatchObject({ start: 0, end: 4 });

		const linkMark = blocks[0].marks?.find((mark) => mark.type === "link");
		expect(linkMark).toMatchObject({
			start: 5,
			end: 14,
			props: { href: "https://example.com" },
		});
	});

	it("plain blockquote stays blockquote (not callout)", () => {
		const blocks = convert("> Just a regular quote", defaultRegistry);

		expect(blocks).toHaveLength(1);
		expect(blocks[0].type).toBe("blockquote");
	});

	it("keeps parseMarkdownToBlocks parse-only in flow documents", () => {
		const source = databaseEditor();
		const markdown = markdownExporter.export(source);
		const editor = createEditor({
			schema: defaultRegistry,
			documentProfile: "flow",
			preset: noDefaultExtensionsPreset,
		});

		const blocks = parseMarkdownToBlocks(`${markdown}\n\n## Allowed`, editor);

		expect(blocks.map((block) => block.type)).toEqual(["database", "heading"]);

		source.destroy();
		editor.destroy();
	});

  it("does not emit normalization diagnostics during parseMarkdownToBlocks", () => {
    const source = databaseEditor();
    const markdown = markdownExporter.export(source);
    const editor = createEditor({
      schema: defaultRegistry,
      documentProfile: "flow",
      preset: noDefaultExtensionsPreset,
    });
    const diagnostics: unknown[] = [];

    editor.on("diagnostic", (event) => {
      diagnostics.push(event);
    });

    parseMarkdownToBlocks(`${markdown}\n\n## Allowed`, editor);

    expect(diagnostics).toEqual([]);

    source.destroy();
    editor.destroy();
  });

	it("filters flow-disallowed blocks during direct markdown import into flow documents", () => {
		const source = databaseEditor();
		const markdown = markdownExporter.export(source);
		const editor = createEditor({
			schema: defaultRegistry,
			documentProfile: "flow",
			preset: noDefaultExtensionsPreset,
		});

		markdownImporter.import(`${markdown}\n\n## Allowed`, editor);

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

  it("returns a structured import result for markdown imports with normalization", () => {
    const source = databaseEditor();
    const markdown = markdownExporter.export(source);
    const editor = createEditor({
      schema: defaultRegistry,
      documentProfile: "flow",
      preset: noDefaultExtensionsPreset,
    });

    const result = markdownImporter.import(`${markdown}\n\n## Allowed`, editor);

    expect(result).toEqual({
      parsedTopLevelBlockCount: 2,
      importedTopLevelBlockCount: 1,
      droppedBlockCount: 1,
      droppedBlockTypes: ["database"],
      normalized: true,
    });

    source.destroy();
    editor.destroy();
  });
});
