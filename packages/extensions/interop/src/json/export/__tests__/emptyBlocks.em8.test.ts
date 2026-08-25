import { describe, expect, it } from "vitest";
import {
	createBareInteropEditor,
	EM8_CELL_CONTROL,
	EM8_KEEP,
	seedEm8Document,
} from "../../../__tests__/interopCorpus";
import { exportEditorToJson, jsonExporter } from "../exporter";
import { jsonImporter } from "../importer";
import type { PenBlockJSON, PenDocumentJSON } from "../types";

function inlineText(block: PenBlockJSON | undefined): string {
	return block?.content?.text ?? "";
}

function findBlock(blocks: PenBlockJSON[], id: string): PenBlockJSON | undefined {
	for (const block of blocks) {
		if (block.id === id) {
			return block;
		}
		if (block.children) {
			const nested = findBlock(block.children, id);
			if (nested) {
				return nested;
			}
		}
	}
	return undefined;
}

function cellAt(
	document: PenDocumentJSON,
	row: number,
	col: number,
): PenBlockJSON | undefined {
	const table = findBlock(document.blocks, "t1");
	const rowBlock = table?.children?.[row];
	return rowBlock?.children?.[col];
}

describe("EM8 JSON interop", () => {
	it("EM8: empty paragraph and empty table cell export as empty; keep\\u200Bme is preserved", async () => {
		const editor = createBareInteropEditor();
		seedEm8Document(editor);

		const json = await jsonExporter.export(editor);
		const serialized = JSON.stringify(json);
		const empty = findBlock(json.blocks, "empty");
		const keep = findBlock(json.blocks, "keep");
		const emptyCell = cellAt(json, 0, 0);
		const controlCell = cellAt(json, 0, 1);

		expect(empty).toBeDefined();
		expect(empty?.type).toBe("paragraph");
		expect(inlineText(empty)).toBe("");
		expect(emptyCell).toBeDefined();
		expect(emptyCell?.type).toBe("__table_cell");
		expect(inlineText(emptyCell)).toBe("");
		expect(keep).toBeDefined();
		expect(inlineText(keep)).toBe(EM8_KEEP);
		expect(controlCell).toBeDefined();
		expect(inlineText(controlCell)).toBe(EM8_CELL_CONTROL);
		expect(serialized).toContain(EM8_KEEP);
		expect(serialized).toContain(EM8_CELL_CONTROL);
		expect(serialized).not.toContain(`"text":"${"\u200B"}"`);

		editor.destroy();
	});

	it("EM8: JSON import keeps empty paragraph and empty cell empty and preserves keep\\u200Bme", async () => {
		const source = createBareInteropEditor();
		seedEm8Document(source);
		const json = exportEditorToJson(source);

		const target = createBareInteropEditor();
		await jsonImporter.import(json, target, { replace: true });

		expect(target.getBlock("empty")?.textContent()).toBe("");
		expect(target.getBlock("keep")?.textContent()).toBe(EM8_KEEP);
		const table = target.getBlock("t1")?.as("table");
		expect(table?.tableCell(0, 0)?.textContent()).toBe("");
		expect(table?.tableCell(0, 1)?.textContent()).toBe(EM8_CELL_CONTROL);
		expect(table).not.toBeNull();

		source.destroy();
		target.destroy();
	});

	it("EM8: getSelectedText is empty for empty paragraph and empty cell and keeps keep\\u200Bme", () => {
		const editor = createBareInteropEditor();
		seedEm8Document(editor);

		editor.selectBlocks(["empty", "keep"]);
		expect(editor.getSelectedText()).toBe(`\n${EM8_KEEP}`);

		editor.selectText("keep", 0, EM8_KEEP.length);
		expect(editor.getSelectedText()).toBe(EM8_KEEP);

		editor.selectBlock("empty");
		expect(editor.getSelectedText()).toBe("");

		editor.selectCell("t1", 0, 0);
		expect(editor.getSelectedText()).toBe("");

		editor.selectCell("t1", 0, 1);
		expect(editor.getSelectedText()).toBe(EM8_CELL_CONTROL);

		editor.destroy();
	});
});
