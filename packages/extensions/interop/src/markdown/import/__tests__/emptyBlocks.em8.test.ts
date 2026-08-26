import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import {
	EM8_CELL_CONTROL,
	EM8_KEEP,
	interopNoExtensionsPreset,
} from "../../../__tests__/interopCorpus";
import { markdownImporter } from "../importer";

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

const EM8_MARKDOWN = `${EM8_KEEP}

|  | ${EM8_CELL_CONTROL} |
| --- | --- |
`;

describe("EM8 markdown import", () => {
	it("EM8: empty table cell imports as empty and keep\\u200Bme is preserved", () => {
		const editor = createBareEditor();
		markdownImporter.import(EM8_MARKDOWN, editor);

		const keepParagraph = [...editor.documentState.allBlocks()].find(
			(handle) => handle.textContent() === EM8_KEEP,
		);
		expect(keepParagraph).toBeDefined();
		expect(keepParagraph?.textContent()).toBe(EM8_KEEP);

		const table = [...editor.documentState.allBlocks()].find(
			(handle) => handle.type === "table",
		);
		const grid = table?.as("table");
		expect(grid).not.toBeNull();
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
