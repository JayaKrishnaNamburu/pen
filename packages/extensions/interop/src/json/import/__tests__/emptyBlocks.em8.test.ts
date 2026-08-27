import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema";
import {
	EM8_CELL_CONTROL,
	EM8_KEEP,
	interopNoExtensionsPreset,
} from "../../../__tests__/interopCorpus";
import { jsonImporter } from "../importer";

function createBareEditor() {
	const editor = createEditor({
		schema: createDefaultSchema(),
		preset: interopNoExtensionsPreset,
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
	return editor;
}

function em8JsonDocument() {
	return {
		version: 1,
		blocks: [
			{
				type: "paragraph",
				props: {},
				content: { text: "" },
			},
			{
				type: "paragraph",
				props: {},
				content: { text: EM8_KEEP },
			},
			{
				type: "table",
				props: { hasHeaderRow: true },
				children: [
					{
						type: "__table_row",
						props: {},
						children: [
							{
								type: "__table_cell",
								props: {},
								content: { text: "" },
							},
							{
								type: "__table_cell",
								props: {},
								content: { text: EM8_CELL_CONTROL },
							},
						],
					},
				],
			},
		],
	};
}

describe("EM8 JSON import", () => {
	it("EM8: empty paragraph and empty table cell import as empty; keep\\u200Bme is preserved", () => {
		const editor = createBareEditor();
		jsonImporter.import(em8JsonDocument(), editor);

		const paragraphs = [...editor.documentState.allBlocks()].filter(
			(handle) => handle.type === "paragraph",
		);
		const emptyParagraph = paragraphs.find(
			(handle) => handle.textContent() === "",
		);
		const keepParagraph = paragraphs.find(
			(handle) => handle.textContent() === EM8_KEEP,
		);
		expect(emptyParagraph).toBeDefined();
		expect(keepParagraph).toBeDefined();
		expect(keepParagraph?.textContent()).toBe(EM8_KEEP);

		const table = [...editor.documentState.allBlocks()].find(
			(handle) => handle.type === "table",
		);
		const grid = table?.as("table");
		expect(grid?.tableCell(0, 0)?.textContent()).toBe("");
		expect(grid?.tableCell(0, 1)?.textContent()).toBe(EM8_CELL_CONTROL);
		expect(
			[...editor.documentState.allBlocks()].some(
				(handle) => handle.textContent() === "\u200B",
			),
		).toBe(false);

		editor.destroy();
	});
});
