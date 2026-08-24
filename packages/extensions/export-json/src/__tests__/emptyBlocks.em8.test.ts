import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { exportEditorToJson, jsonExporter } from "../exporter";
import { jsonImporter } from "../importer";
import type { PenBlockJSON, PenDocumentJSON } from "../types";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const KEEP = "keep\u200Bme";
const CELL_CONTROL = "CELL-OK";

function createBareEditor() {
	const editor = createEditor({
		schema: defaultSchema,
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

function seedEm8Fixture(editor: ReturnType<typeof createBareEditor>) {
	editor.apply([
		{
			type: "insert-block",
			blockId: "empty",
			blockType: "paragraph",
			props: {},
			position: "last",
		},
		{
			type: "insert-block",
			blockId: "keep",
			blockType: "paragraph",
			props: {},
			position: "last",
		},
		{
			type: "insert-block",
			blockId: "t1",
			blockType: "table",
			props: { hasHeaderRow: true },
			position: "last",
		},
	]);
	editor.apply([
		{
			type: "splice-text",
			blockId: "keep",
			from: 0,
			to: 0,
			insert: KEEP,
		},
		{
			type: "splice-text",
			blockId: "t1",
			cell: { row: 0, col: 1 },
			from: 0,
			to: 0,
			insert: CELL_CONTROL,
		},
	]);
}

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
		const editor = createBareEditor();
		seedEm8Fixture(editor);

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
		expect(inlineText(keep)).toBe(KEEP);
		expect(controlCell).toBeDefined();
		expect(inlineText(controlCell)).toBe(CELL_CONTROL);
		expect(serialized).toContain(KEEP);
		expect(serialized).toContain(CELL_CONTROL);
		expect(serialized).not.toContain(`"text":"${"\u200B"}"`);

		editor.destroy();
	});

	it("EM8: JSON import keeps empty paragraph and empty cell empty and preserves keep\\u200Bme", async () => {
		const source = createBareEditor();
		seedEm8Fixture(source);
		const json = exportEditorToJson(source);

		const target = createBareEditor();
		await jsonImporter.import(json, target, { replace: true });

		expect(target.getBlock("empty")?.textContent()).toBe("");
		expect(target.getBlock("keep")?.textContent()).toBe(KEEP);
		const table = target.getBlock("t1")?.as("table");
		expect(table?.tableCell(0, 0)?.textContent()).toBe("");
		expect(table?.tableCell(0, 1)?.textContent()).toBe(CELL_CONTROL);
		expect(table).not.toBeNull();

		source.destroy();
		target.destroy();
	});

	it("EM8: getSelectedText is empty for empty paragraph and empty cell and keeps keep\\u200Bme", () => {
		const editor = createBareEditor();
		seedEm8Fixture(editor);

		editor.selectBlocks(["empty", "keep"]);
		expect(editor.getSelectedText()).toBe(`\n${KEEP}`);

		editor.selectText("keep", 0, KEEP.length);
		expect(editor.getSelectedText()).toBe(KEEP);

		editor.selectBlock("empty");
		expect(editor.getSelectedText()).toBe("");

		editor.selectCell("t1", 0, 0);
		expect(editor.getSelectedText()).toBe("");

		editor.selectCell("t1", 0, 1);
		expect(editor.getSelectedText()).toBe(CELL_CONTROL);

		editor.destroy();
	});
});
