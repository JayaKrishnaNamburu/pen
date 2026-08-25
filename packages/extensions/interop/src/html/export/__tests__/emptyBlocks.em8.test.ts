import { describe, expect, it } from "vitest";
import {
	createBareInteropEditor,
	EM8_CELL_CONTROL,
	EM8_KEEP,
	seedEm8Document,
} from "../../../__tests__/interopCorpus";
import { htmlExporter } from "../exporter";

describe("EM8 HTML export", () => {
	it("EM8: empty paragraph and empty table cell export as empty; keep\\u200Bme is preserved", () => {
		const editor = createBareInteropEditor();
		seedEm8Document(editor);

		const html = htmlExporter.export(editor);

		expect(html).toContain(`<p>${EM8_KEEP}</p>`);
		expect(html).toContain(`<th>${EM8_CELL_CONTROL}</th>`);
		expect(html).toMatch(/<p><\/p>/);
		expect(html).toMatch(/<th><\/th>/);
		expect(html).not.toMatch(/<p>\u200B<\/p>/);
		expect(html).not.toMatch(/<(td|th)>\u200B<\/(td|th)>/);

		editor.destroy();
	});
});
