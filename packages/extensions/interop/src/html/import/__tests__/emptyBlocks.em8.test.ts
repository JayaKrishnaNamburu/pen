import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema";
import {
	EM8_CELL_CONTROL,
	EM8_KEEP,
	interopNoExtensionsPreset,
} from "../../../__tests__/interopCorpus";
import { htmlImporter } from "../importer";

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

const EM8_HTML = `<p></p><p>${EM8_KEEP}</p><table><tbody><tr><td></td><td>${EM8_CELL_CONTROL}</td></tr></tbody></table>`;

describe("EM8 HTML import", () => {
	it("EM8: empty paragraph and empty table cell import as empty; keep\\u200Bme is preserved", async () => {
		const editor = createBareEditor();
		await htmlImporter.import(EM8_HTML, editor);

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
