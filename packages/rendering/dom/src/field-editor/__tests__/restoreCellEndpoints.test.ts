import { describe, expect, it } from "vitest";
import { resolveRestoreCellEndpoints } from "../selectionAuthority";

const BLOCK_ID = "table-1";
const ACTIVE = { row: 0, col: 0 } as const;

describe("resolveRestoreCellEndpoints", () => {
	it("ranks an addressable programmatic stamp over the cell stamp", () => {
		expect(
			resolveRestoreCellEndpoints(
				{
					blockId: BLOCK_ID,
					anchorOffset: 4,
					focusOffset: 4,
					cell: ACTIVE,
				},
				{
					blockId: BLOCK_ID,
					anchorOffset: 1,
					focusOffset: 1,
					cell: ACTIVE,
				},
				ACTIVE,
			),
		).toEqual({
			blockId: BLOCK_ID,
			anchorOffset: 4,
			focusOffset: 4,
			cell: ACTIVE,
		});
	});

	it("uses the cell stamp when no programmatic stamp is present", () => {
		expect(
			resolveRestoreCellEndpoints(
				null,
				{
					blockId: BLOCK_ID,
					anchorOffset: 1,
					focusOffset: 1,
					cell: ACTIVE,
				},
				ACTIVE,
			),
		).toEqual({
			blockId: BLOCK_ID,
			anchorOffset: 1,
			focusOffset: 1,
			cell: ACTIVE,
		});
	});

	it("does not apply a programmatic stamp that names a different cell", () => {
		expect(
			resolveRestoreCellEndpoints(
				{
					blockId: BLOCK_ID,
					anchorOffset: 5,
					focusOffset: 5,
					cell: { row: 1, col: 0 },
				},
				{
					blockId: BLOCK_ID,
					anchorOffset: 1,
					focusOffset: 1,
					cell: ACTIVE,
				},
				ACTIVE,
			),
		).toEqual({
			blockId: BLOCK_ID,
			anchorOffset: 1,
			focusOffset: 1,
			cell: ACTIVE,
		});
	});

	it("returns null when no stamp addresses the active cell", () => {
		expect(
			resolveRestoreCellEndpoints(
				{
					blockId: BLOCK_ID,
					anchorOffset: 5,
					focusOffset: 5,
					cell: { row: 1, col: 0 },
				},
				null,
				ACTIVE,
			),
		).toBeNull();
	});

	it("does not treat a block-level stamp as addressable inside a cell", () => {
		expect(
			resolveRestoreCellEndpoints(
				{
					blockId: BLOCK_ID,
					anchorOffset: 0,
					focusOffset: 0,
				},
				{
					blockId: BLOCK_ID,
					anchorOffset: 2,
					focusOffset: 2,
					cell: ACTIVE,
				},
				ACTIVE,
			),
		).toEqual({
			blockId: BLOCK_ID,
			anchorOffset: 2,
			focusOffset: 2,
			cell: ACTIVE,
		});
	});
});
