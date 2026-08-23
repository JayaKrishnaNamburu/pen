import { describe, expect, it } from "vitest";

import { createHeadlessEditor } from "../index";
import { defaultSchema } from "./fixtures/testSchema";

const NORTH = "meadow";
const SOUTH = "sage-brush";

describe("change summaries — two-cell collision", () => {
	it("keeps both cell edits from one apply in the change summary", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		editor.apply([
			{
				type: "insert-block",
				blockId: "two-cell-table",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "insert-table-cell-text",
				blockId: "two-cell-table",
				row: 0,
				col: 0,
				offset: 0,
				text: NORTH,
			},
			{
				type: "insert-table-cell-text",
				blockId: "two-cell-table",
				row: 1,
				col: 1,
				offset: 0,
				text: SOUTH,
			},
		]);

		const table = editor.getBlock("two-cell-table")?.as("table");
		expect(table?.tableCell(0, 0)?.textContent()).toBe(NORTH);
		expect(table?.tableCell(1, 1)?.textContent()).toBe(SOUTH);

		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		const insertLengths = (summary?.text ?? []).flatMap((change) =>
			change.splices.map((splice) => splice.insertLength),
		);
		expect(insertLengths).toContain(NORTH.length);
		expect(insertLengths).toContain(SOUTH.length);

		editor.destroy();
	});
});
