import { describe, expect, it } from "vitest";
import type {
	Affinity,
	BlockSelectionV2,
	CellSelectionV2,
	SelectionOriginV2,
	SelectionRecordV2,
	TextSelectionV2,
} from "../types/selectionV2";

function collapsedText(blockId: string, offset: number): TextSelectionV2 {
	const point = { blockId, offset };
	return {
		type: "text",
		anchor: point,
		focus: point,
		affinity: "downstream",
		goalX: null,
	};
}

describe("S-types", () => {
	it("S-types: TextSelectionV2 carries affinity and goalX as plain fields", () => {
		const sel: TextSelectionV2 = {
			type: "text",
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "a", offset: 3 },
			affinity: "upstream",
			goalX: 12,
		};
		const affinity: Affinity = sel.affinity;

		expect(affinity).toBe("upstream");
		expect(sel.goalX).toBe(12);
		expect("isCollapsed" in sel).toBe(false);
		expect("isMultiBlock" in sel).toBe(false);
		expect("blockRange" in sel).toBe(false);
		expect("toRange" in sel).toBe(false);
	});

	it("S-types: BlockSelectionV2.head is first or last of blockIds", () => {
		const fromStart: BlockSelectionV2 = {
			type: "block",
			blockIds: ["a", "b", "c"],
			head: "a",
		};
		const fromEnd: BlockSelectionV2 = {
			type: "block",
			blockIds: ["a", "b", "c"],
			head: "c",
		};

		expect(
			fromStart.head === fromStart.blockIds[0] ||
				fromStart.head === fromStart.blockIds[fromStart.blockIds.length - 1],
		).toBe(true);
		expect(
			fromEnd.head === fromEnd.blockIds[0] ||
				fromEnd.head === fromEnd.blockIds[fromEnd.blockIds.length - 1],
		).toBe(true);
	});

	it("S-types: CellSelectionV2 has no rowIds or columnIds", () => {
		const sel: CellSelectionV2 = {
			type: "cell",
			blockId: "table",
			anchor: { row: 0, col: 0 },
			head: { row: 1, col: 2 },
		};

		expect("rowIds" in sel).toBe(false);
		expect("columnIds" in sel).toBe(false);
	});

	it("S-types: SelectionRecordV2 is a serializable value with origin and versions", () => {
		const origins: readonly SelectionOriginV2[] = [
			"pointer",
			"keyboard",
			"ime",
			"programmatic",
			"mapped",
			"restore",
			"gc",
		];
		const record: SelectionRecordV2 = {
			state: collapsedText("a", 0),
			version: 1,
			origin: "keyboard",
			commitId: 4,
		};

		expect(origins).toHaveLength(7);
		expect(JSON.parse(JSON.stringify(record))).toEqual(record);
	});
});
