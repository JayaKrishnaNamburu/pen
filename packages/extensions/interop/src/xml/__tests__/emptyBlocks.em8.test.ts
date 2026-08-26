import { describe, expect, it } from "vitest";
import {
	createBareInteropEditor,
	EM8_CELL_CONTROL,
	EM8_KEEP,
	seedEm8Document,
} from "../../__tests__/interopCorpus";
import { xmlExporter } from "../exporter";
import { xmlImporter } from "../importer";

describe("EM8 XML interop", () => {
	it("EM8: empty paragraph and empty table cell export as empty; keep\\u200Bme is preserved", async () => {
		const editor = createBareInteropEditor();
		seedEm8Document(editor);

		const xml = await xmlExporter.export(editor);

		expect(xml).toContain(`<content>${EM8_KEEP}</content>`);
		expect(xml).toContain(`<content>${EM8_CELL_CONTROL}</content>`);
		expect(xml).toContain('<block id="empty" type="paragraph">');
		expect(xml).toContain('<block id="cell-0-0" type="__table_cell">');
		expect(xml).not.toMatch(/<content>\u200B<\/content>/);

		editor.destroy();
	});

	it("EM8: XML import keeps empty paragraph and empty cell empty and preserves keep\\u200Bme", async () => {
		const source = createBareInteropEditor();
		seedEm8Document(source);
		const xml = await xmlExporter.export(source);

		const target = createBareInteropEditor();
		await xmlImporter.import(xml, target, { replace: true });

		expect(target.getBlock("empty")?.textContent()).toBe("");
		expect(target.getBlock("keep")?.textContent()).toBe(EM8_KEEP);
		const table = target.getBlock("t1")?.as("table");
		expect(table?.tableCell(0, 0)?.textContent()).toBe("");
		expect(table?.tableCell(0, 1)?.textContent()).toBe(EM8_CELL_CONTROL);
		expect(table).not.toBeNull();

		source.destroy();
		target.destroy();
	});
});
