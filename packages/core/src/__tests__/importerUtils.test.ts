import { describe, expect, it } from "vitest";

import { createEditor } from "../index";
import { blocksToOps } from "../importerUtils";
import type { PendingBlock } from "../importerUtils";

describe("blocksToOps table materialization", () => {
	it("materializes __table_row / __table_cell into table ops", () => {
		const blocks: PendingBlock[] = [
			{
				type: "table",
				props: { hasHeaderRow: true },
				children: [
					{
						type: "__table_row",
						props: { _rowIndex: 0 },
						children: [
							{
								type: "__table_cell",
								props: { _rowIndex: 0, _colIndex: 0 },
								content: "Name",
								marks: [],
							},
							{
								type: "__table_cell",
								props: { _rowIndex: 0, _colIndex: 1 },
								content: "Age",
								marks: [],
							},
						],
					},
					{
						type: "__table_row",
						props: { _rowIndex: 1 },
						children: [
							{
								type: "__table_cell",
								props: { _rowIndex: 1, _colIndex: 0 },
								content: "Alice",
								marks: [],
							},
							{
								type: "__table_cell",
								props: { _rowIndex: 1, _colIndex: 1 },
								content: "30",
								marks: [],
							},
						],
					},
				],
			},
		];

		const ops = blocksToOps(blocks);

		expect(ops[0].type).toBe("insert-block");
		expect((ops[0] as any).blockType).toBe("table");

		const tableBlockId = (ops[0] as any).blockId;

		const cellTextOps = ops.filter(
			(op) => op.type === "insert-table-cell-text",
		);
		expect(cellTextOps.length).toBe(4);

		const firstCellText = cellTextOps[0] as any;
		expect(firstCellText.blockId).toBe(tableBlockId);
		expect(firstCellText.row).toBe(0);
		expect(firstCellText.col).toBe(0);
		expect(firstCellText.text).toBe("Name");

		const lastCellText = cellTextOps[3] as any;
		expect(lastCellText.row).toBe(1);
		expect(lastCellText.col).toBe(1);
		expect(lastCellText.text).toBe("30");
	});

	it("generates insert-table-row for rows beyond the seed", () => {
		const blocks: PendingBlock[] = [
			{
				type: "table",
				props: {},
				children: [
					{
						type: "__table_row",
						props: {},
						children: [
							{
								type: "__table_cell",
								props: {},
								content: "A",
							},
						],
					},
					{
						type: "__table_row",
						props: {},
						children: [
							{
								type: "__table_cell",
								props: {},
								content: "B",
							},
						],
					},
					{
						type: "__table_row",
						props: {},
						children: [
							{
								type: "__table_cell",
								props: {},
								content: "C",
							},
						],
					},
				],
			},
		];

		const ops = blocksToOps(blocks);
		const rowOps = ops.filter((op) => op.type === "insert-table-row");
		expect(rowOps.length).toBe(1);
		expect((rowOps[0] as any).index).toBe(2);
	});

	it("generates insert-table-column for columns beyond the seed", () => {
		const blocks: PendingBlock[] = [
			{
				type: "table",
				props: {},
				children: [
					{
						type: "__table_row",
						props: {},
						children: [
							{ type: "__table_cell", props: {}, content: "A" },
							{ type: "__table_cell", props: {}, content: "B" },
							{ type: "__table_cell", props: {}, content: "C" },
						],
					},
				],
			},
		];

		const ops = blocksToOps(blocks);
		const colOps = ops.filter((op) => op.type === "insert-table-column");
		expect(colOps.length).toBe(1);
		expect((colOps[0] as any).index).toBe(2);
	});

	it("generates format-table-cell-text for marks on cells", () => {
		const blocks: PendingBlock[] = [
			{
				type: "table",
				props: {},
				children: [
					{
						type: "__table_row",
						props: {},
						children: [
							{
								type: "__table_cell",
								props: {},
								content: "bold text",
								marks: [{ type: "bold", start: 0, end: 4 }],
							},
						],
					},
				],
			},
		];

		const ops = blocksToOps(blocks);
		const fmtOps = ops.filter(
			(op) => op.type === "format-table-cell-text",
		);
		expect(fmtOps.length).toBe(1);
		expect((fmtOps[0] as any).marks).toEqual({ bold: true });
		expect((fmtOps[0] as any).offset).toBe(0);
		expect((fmtOps[0] as any).length).toBe(4);
	});

	it("does not recurse __table children as regular blocks", () => {
		const blocks: PendingBlock[] = [
			{
				type: "table",
				props: {},
				children: [
					{
						type: "__table_row",
						props: {},
						children: [
							{ type: "__table_cell", props: {}, content: "ok" },
						],
					},
				],
			},
		];

		const ops = blocksToOps(blocks);
		const blockOps = ops.filter((op) => op.type === "insert-block");
		expect(blockOps.length).toBe(1);
		expect((blockOps[0] as any).blockType).toBe("table");
	});

	it("shrinks seeded tables to 1x1 during import materialization", () => {
		const blocks: PendingBlock[] = [
			{
				type: "table",
				props: {},
				children: [
					{
						type: "__table_row",
						props: {},
						children: [
							{ type: "__table_cell", props: {}, content: "Only" },
						],
					},
				],
			},
		];

		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});

		editor.apply(blocksToOps(blocks));

		const imported = editor.lastBlock()!;
		expect(imported.type).toBe("table");
		expect(imported.tableRowCount()).toBe(1);
		expect(imported.tableColumnCount()).toBe(1);
		expect(imported.tableCell(0, 0)?.textContent()).toBe("Only");

		editor.destroy();
	});

	it("shrinks seeded tables to a single column during import materialization", () => {
		const blocks: PendingBlock[] = [
			{
				type: "table",
				props: {},
				children: [
					{
						type: "__table_row",
						props: {},
						children: [{ type: "__table_cell", props: {}, content: "A" }],
					},
					{
						type: "__table_row",
						props: {},
						children: [{ type: "__table_cell", props: {}, content: "B" }],
					},
					{
						type: "__table_row",
						props: {},
						children: [{ type: "__table_cell", props: {}, content: "C" }],
					},
				],
			},
		];

		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});

		editor.apply(blocksToOps(blocks));

		const imported = editor.lastBlock()!;
		expect(imported.tableRowCount()).toBe(3);
		expect(imported.tableColumnCount()).toBe(1);
		expect(imported.tableCell(2, 0)?.textContent()).toBe("C");

		editor.destroy();
	});

	it("expands columns to fit ragged rows beyond the first row", () => {
		const blocks: PendingBlock[] = [
			{
				type: "table",
				props: {},
				children: [
					{
						type: "__table_row",
						props: {},
						children: [{ type: "__table_cell", props: {}, content: "A" }],
					},
					{
						type: "__table_row",
						props: {},
						children: [
							{ type: "__table_cell", props: {}, content: "B1" },
							{ type: "__table_cell", props: {}, content: "B2" },
							{ type: "__table_cell", props: {}, content: "B3" },
						],
					},
				],
			},
		];

		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});

		editor.apply(blocksToOps(blocks));

		const imported = editor.lastBlock()!;
		expect(imported.tableRowCount()).toBe(2);
		expect(imported.tableColumnCount()).toBe(3);
		expect(imported.tableCell(1, 2)?.textContent()).toBe("B3");

		editor.destroy();
	});
});
