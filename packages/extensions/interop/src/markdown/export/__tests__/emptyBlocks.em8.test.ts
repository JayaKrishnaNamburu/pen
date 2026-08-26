import { describe, expect, it } from "vitest";
import {
	createBareInteropEditor,
	EM8_CELL_CONTROL,
	EM8_KEEP,
	seedEm8Document,
} from "../../../__tests__/interopCorpus";
import { markdownExporter } from "../exporter";

describe("EM8 markdown export", () => {
	it("EM8: empty paragraph and empty table cell export as empty; keep\\u200Bme is preserved", () => {
		const editor = createBareInteropEditor();
		seedEm8Document(editor);

		const markdown = markdownExporter.export(editor);
		// the exporter's return type admits a promise; this fixture is synchronous,
		// and narrowing here keeps the string assertions below honest.
		if (typeof markdown !== "string") {
			throw new Error("expected a synchronous markdown export");
		}

		expect(markdown.startsWith(`\n\n${EM8_KEEP}`)).toBe(true);
		expect(markdown).toContain(EM8_KEEP);
		expect(markdown).toContain(EM8_CELL_CONTROL);
		expect(markdown).toContain(`|  | ${EM8_CELL_CONTROL} |`);
		expect(markdown.split("\n").some((line) => line === "\u200B")).toBe(false);
		expect(markdown).not.toMatch(/\|\s*\u200B\s*\|/);

		editor.destroy();
	});
});
