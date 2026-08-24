import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import { markdownImporter } from "../importer";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const KEEP = "keep\u200Bme";
const CELL_CONTROL = "CELL-OK";

function createBareEditor() {
	const editor = createEditor({
		schema: createDefaultSchema(),
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
	return editor;
}

const EM8_MARKDOWN = `${KEEP}

|  | ${CELL_CONTROL} |
| --- | --- |
`;

describe("EM8 markdown import", () => {
	it("EM8: empty table cell imports as empty and keep\\u200Bme is preserved", () => {
		const editor = createBareEditor();
		markdownImporter.import(EM8_MARKDOWN, editor);

		const keepParagraph = [...editor.documentState.allBlocks()].find(
			(handle) => handle.textContent() === KEEP,
		);
		expect(keepParagraph).toBeDefined();
		expect(keepParagraph?.textContent()).toBe(KEEP);

		const table = [...editor.documentState.allBlocks()].find(
			(handle) => handle.type === "table",
		);
		const grid = table?.as("table");
		expect(grid).not.toBeNull();
		expect(grid?.tableCell(0, 0)?.textContent()).toBe("");
		expect(grid?.tableCell(0, 1)?.textContent()).toBe(CELL_CONTROL);
		expect(
			[...editor.documentState.allBlocks()].some(
				(handle) => handle.textContent() === "\u200B",
			),
		).toBe(false);

		editor.destroy();
	});
});
