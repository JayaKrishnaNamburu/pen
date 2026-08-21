import type { BlockHandle } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { buildTableChildren } from "../exporterUtils";

describe("buildTableChildren", () => {
	it("materializes table cells into __table_row / __table_cell blocks", () => {
		const handle = createTableHandle([
			["A", "B"],
			["C", "D"],
		]);

		expect(buildTableChildren(handle)).toEqual([
			{
				id: "row-0",
				type: "__table_row",
				props: {},
				children: [
					{ id: "0-0", type: "__table_cell", props: {}, content: "A" },
					{ id: "0-1", type: "__table_cell", props: {}, content: "B" },
				],
			},
			{
				id: "row-1",
				type: "__table_row",
				props: {},
				children: [
					{ id: "1-0", type: "__table_cell", props: {}, content: "C" },
					{ id: "1-1", type: "__table_cell", props: {}, content: "D" },
				],
			},
		]);
	});

	it("returns undefined when the handle is not a table or has no rows", () => {
		expect(
			buildTableChildren({
				id: "p1",
				type: "paragraph",
				as: () => null,
			} as unknown as BlockHandle),
		).toBeUndefined();
		expect(buildTableChildren(createTableHandle([]))).toBeUndefined();
	});
});

function createTableHandle(cells: string[][]): BlockHandle {
	const handle = {
		id: "t1",
		type: "table",
		props: {},
		tableRowCount: () => cells.length,
		tableColumnCount: () => cells[0]?.length ?? 0,
		tableCell: (row: number, col: number) => ({
			id: `${row}-${col}`,
			textContent: () => cells[row]?.[col] ?? "",
		}),
		as(capability: string) {
			return capability === "table" ? handle : null;
		},
	};
	return handle as unknown as BlockHandle;
}
