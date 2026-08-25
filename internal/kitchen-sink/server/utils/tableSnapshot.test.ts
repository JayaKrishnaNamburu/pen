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
			{ type: "grid", blockId: "table-1", change: { kind: "delete-row", index: 1  }},
			{ type: "grid", blockId: "table-1", change: { kind: "delete-column", index: 1  }},
			{
				type: "splice-text",
				blockId: "table-1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 0,
				insert: "A1",
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
			{ type: "grid", blockId: "table-1", change: { kind: "insert-column", index: 2  }},
			{ type: "grid", blockId: "table-1", change: { kind: "insert-row", index: 2  }},
		]);
	});
});
