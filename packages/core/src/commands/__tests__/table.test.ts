import { describe, expect, it } from "vitest";

import {
	tableCellDown,
	tableCellNext,
	tableCellPrev,
	tableEscapeGrid,
} from "..";
import { caretOf, createCommandEditor, createCommandHarness } from "./fixture";

function cellOf(editor: ReturnType<typeof createCommandEditor>): {
	blockId: string;
	row: number;
	col: number;
} {
	const selection = editor.selection;
	if (!selection || selection.type !== "cell") {
		throw new Error(
			`expected cell selection, got ${selection?.type ?? "null"}`,
		);
	}
	return {
		blockId: selection.blockId,
		row: selection.head.row,
		col: selection.head.col,
	};
}

describe("table commands", () => {
	it("cellNext walks linearly and stays on the last cell", () => {
		const editor = createCommandEditor([{ id: "t", type: "table" }]);
		const registry = createCommandHarness(editor);
		editor.selectCell("t", 0, 0);

		expect(registry.dispatch(tableCellNext, undefined)).toBe(true);
		expect(cellOf(editor)).toEqual({ blockId: "t", row: 0, col: 1 });

		expect(registry.dispatch(tableCellNext, undefined)).toBe(true);
		expect(cellOf(editor)).toEqual({ blockId: "t", row: 1, col: 0 });

		expect(registry.dispatch(tableCellNext, undefined)).toBe(true);
		expect(cellOf(editor)).toEqual({ blockId: "t", row: 1, col: 1 });

		expect(registry.dispatch(tableCellNext, undefined)).toBe(true);
		expect(cellOf(editor)).toEqual({ blockId: "t", row: 1, col: 1 });
		editor.destroy();
	});

	it("cellPrev is the reverse walk and stays on the first cell", () => {
		const editor = createCommandEditor([{ id: "t", type: "table" }]);
		const registry = createCommandHarness(editor);
		editor.selectCell("t", 1, 0);

		expect(registry.dispatch(tableCellPrev, undefined)).toBe(true);
		expect(cellOf(editor)).toEqual({ blockId: "t", row: 0, col: 1 });

		editor.selectCell("t", 0, 0);
		expect(registry.dispatch(tableCellPrev, undefined)).toBe(true);
		expect(cellOf(editor)).toEqual({ blockId: "t", row: 0, col: 0 });
		editor.destroy();
	});

	it("cellDown moves one row in the same column and clamps on the last row", () => {
		const editor = createCommandEditor([{ id: "t", type: "table" }]);
		const registry = createCommandHarness(editor);
		editor.selectCell("t", 0, 1);

		expect(registry.dispatch(tableCellDown, undefined)).toBe(true);
		expect(cellOf(editor)).toEqual({ blockId: "t", row: 1, col: 1 });

		expect(registry.dispatch(tableCellDown, undefined)).toBe(true);
		expect(cellOf(editor)).toEqual({ blockId: "t", row: 1, col: 1 });
		editor.destroy();
	});

	it("escapeGrid lands outside the table", () => {
		const editor = createCommandEditor([
			{ id: "before", type: "paragraph", text: "hi" },
			{ id: "t", type: "table" },
			{ id: "after", type: "paragraph", text: "yo" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectCell("t", 0, 0);

		expect(registry.dispatch(tableEscapeGrid, undefined)).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "after", offset: 0 });
		expect(editor.selection?.type).toBe("text");
		editor.destroy();
	});
});
