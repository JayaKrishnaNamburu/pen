import { describe, expect, it } from "vitest";
import { buildTableSnapshotOps } from "./tableSnapshot";

describe("tableSnapshot", () => {
	it("shrinks seeded grids before applying serialized cell content", () => {
		const ops = buildTableSnapshotOps(
			"table-1",
			{
				rowCount: 1,
				columnCount: 1,
				columns: [],
				rows: [
					{
						id: "row-0",
						index: 0,
						cells: [{ id: "cell-0-0", row: 0, col: 0, text: "A1" }],
					},
				],
			},
			{ rowCount: 2, columnCount: 2 },
		);

		expect(ops).toEqual([
			{ type: "delete-table-row", blockId: "table-1", index: 1 },
			{ type: "delete-table-column", blockId: "table-1", index: 1 },
			{
				type: "insert-table-cell-text",
				blockId: "table-1",
				row: 0,
				col: 0,
				offset: 0,
				text: "A1",
			},
		]);
	});

	it("expands grids when serialized dimensions exceed the current shape", () => {
		const ops = buildTableSnapshotOps(
			"table-1",
			{
				rowCount: 3,
				columnCount: 3,
				columns: [],
				rows: [],
			},
			{ rowCount: 2, columnCount: 2 },
		);

		expect(ops).toEqual([
			{ type: "insert-table-column", blockId: "table-1", index: 2 },
			{ type: "insert-table-row", blockId: "table-1", index: 2 },
		]);
	});
});
