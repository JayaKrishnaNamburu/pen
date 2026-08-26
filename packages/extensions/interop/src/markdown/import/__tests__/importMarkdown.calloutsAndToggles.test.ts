import { describe, it, expect } from "vitest";
import { createEditor } from "@input/pen-core";
import type { SchemaRegistry } from "@input/pen-types";
import { markdownExporter } from "../../export";
import { createDefaultSchema } from "@input/pen-schema-default";
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

function tableEditor() {
	const editor = createEditor({
		schema: defaultRegistry,
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
	editor.apply([{
		type: "insert-block",
		blockId: "t1",
		blockType: "table",
		props: { hasHeaderRow: true },
		position: "last",
	}]);
	editor.apply([{
		type: "splice-text",
		blockId: "t1",
		cell: { row: 0, col: 0 },
		from: 0,
		to: 0,
		insert: "Name",
	}]);
	return editor;
}

describe("@input/pen-interop/markdown: callouts and toggles", () => {
	it("preserves inline formatting after a markdown callout prefix", () => {
		const blocks = convert(
			"> **Note:** This is *very* [important](https://example.com)",
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "callout",
			props: { severity: "info" },
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

	it("attaches compact details body children instead of dropping them", () => {
		const blocks = convert(
			"<details><summary>TOGGLE-TITLE</summary><p>NESTED-TOGGLE-CHILD</p></details>",
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "toggle",
			content: "TOGGLE-TITLE",
		});
		expect(blocks[0]?.children).toEqual([
			expect.objectContaining({
				type: "paragraph",
				content: "NESTED-TOGGLE-CHILD",
			}),
		]);
	});

	it("attaches details siblings after a blank line until </details>", () => {
		const blocks = convert(
			"<details>\n<summary>TOGGLE-TITLE</summary>\n\nNESTED-TOGGLE-CHILD\n\n</details>",
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "toggle",
			content: "TOGGLE-TITLE",
		});
		expect(blocks[0]?.children).toEqual([
			expect.objectContaining({
				type: "paragraph",
				content: "NESTED-TOGGLE-CHILD",
			}),
		]);
	});

	it("attaches remaining callout paragraphs as children, not drops them", () => {
		const blocks = convert(
			"> **Note:** CALLOUT-TITLE\n>\n> NESTED-CALLOUT-CHILD",
			defaultRegistry,
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "callout",
			props: { severity: "info" },
			content: "CALLOUT-TITLE",
		});
		expect(blocks[0]?.children).toEqual([
			expect.objectContaining({
				type: "paragraph",
				content: "NESTED-CALLOUT-CHILD",
			}),
		]);
	});

	it("plain blockquote stays blockquote (not callout)", () => {
		const blocks = convert("> Just a regular quote", defaultRegistry);

		expect(blocks).toHaveLength(1);
		expect(blocks[0].type).toBe("blockquote");
	});

	it("keeps parseMarkdownToBlocks parse-only in flow documents", () => {
		const source = tableEditor();
		const markdown = markdownExporter.export(source);
		const editor = createEditor({
			schema: defaultRegistry,
			documentProfile: "flow",
			preset: noDefaultExtensionsPreset,
		});

		const blocks = parseMarkdownToBlocks(`${markdown}\n\n## Allowed`, editor);

		expect(blocks.map((block) => block.type)).toEqual(["table", "heading"]);

		source.destroy();
		editor.destroy();
	});

  it("does not emit normalization diagnostics during parseMarkdownToBlocks", () => {
    const source = tableEditor();
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

	it("imports table blocks into flow documents", () => {
		const source = tableEditor();
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
			blockOrder.some((blockId) => editor.getBlock(blockId)?.type === "table"),
		).toBe(true);

		source.destroy();
		editor.destroy();
	});

  it("IOP6 returns a structured import result for markdown imports", () => {
    const source = tableEditor();
    const markdown = markdownExporter.export(source);
    const editor = createEditor({
      schema: defaultRegistry,
      documentProfile: "flow",
      preset: noDefaultExtensionsPreset,
    });

    const result = markdownImporter.import(`${markdown}\n\n## Allowed`, editor);

    expect(result).toEqual({
      parsedTopLevelBlockCount: 2,
      importedTopLevelBlockCount: 2,
      droppedBlockCount: 0,
      droppedBlockTypes: [],
      normalized: false,
      droppedByReason: [],
    });

    source.destroy();
    editor.destroy();
  });
});
