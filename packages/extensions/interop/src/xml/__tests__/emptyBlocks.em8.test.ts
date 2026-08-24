import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { xmlExporter } from "../exporter";
import { xmlImporter } from "../importer";

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

describe("EM8 XML interop", () => {
	it("EM8: empty paragraph and empty table cell export as empty; keep\\u200Bme is preserved", async () => {
		const editor = createBareEditor();
		seedEm8Fixture(editor);

		const xml = await xmlExporter.export(editor);

		expect(xml).toContain(`<content>${KEEP}</content>`);
		expect(xml).toContain(`<content>${CELL_CONTROL}</content>`);
		expect(xml).toContain('<block id="empty" type="paragraph">');
		expect(xml).toContain('<block id="cell-0-0" type="__table_cell">');
		expect(xml).not.toMatch(/<content>\u200B<\/content>/);

		editor.destroy();
	});

	it("EM8: XML import keeps empty paragraph and empty cell empty and preserves keep\\u200Bme", async () => {
		const source = createBareEditor();
		seedEm8Fixture(source);
		const xml = await xmlExporter.export(source);

		const target = createBareEditor();
		await xmlImporter.import(xml, target, { replace: true });

		expect(target.getBlock("empty")?.textContent()).toBe("");
		expect(target.getBlock("keep")?.textContent()).toBe(KEEP);
		const table = target.getBlock("t1")?.as("table");
		expect(table?.tableCell(0, 0)?.textContent()).toBe("");
		expect(table?.tableCell(0, 1)?.textContent()).toBe(CELL_CONTROL);
		expect(table).not.toBeNull();

		source.destroy();
		target.destroy();
	});
});
