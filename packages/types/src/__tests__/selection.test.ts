import { describe, expect, it } from "vitest";
import type {
	Affinity,
	BlockSelection,
	CellSelection,
	ReadonlySelectionState,
	SelectionOrigin,
	SelectionRecord,
	SelectionRecordState,
	SelectionState,
	TextSelection,
} from "../types/index";

function collapsedRecordState(
	blockId: string,
	offset: number,
): SelectionRecordState {
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
	it("S-types: live TextSelection carries optional affinity and goalX", () => {
		const sel: TextSelection = {
			type: "text",
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "a", offset: 3 },
			affinity: "upstream",
			goalX: 12,
			isCollapsed: false,
			isMultiBlock: false,
			blockRange: ["a"],
			toRange: () => {
				throw new Error("unused");
			},
		};
		const affinity: Affinity = sel.affinity ?? "downstream";

		expect(affinity).toBe("upstream");
		expect(sel.goalX).toBe(12);
	});

	it("S-types: v1 TextSelection objects still assign without affinity", () => {
		const sel: TextSelection = {
			type: "text",
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "a", offset: 0 },
			isCollapsed: true,
			isMultiBlock: false,
			blockRange: ["a"],
			toRange: () => {
				throw new Error("unused");
			},
		};

		expect(sel.affinity).toBeUndefined();
		expect(sel.goalX).toBeUndefined();
	});

	it("S-types: BlockSelection.head is optional until the authority writes it", () => {
		const withoutHead: BlockSelection = {
			type: "block",
			blockIds: ["a", "b", "c"],
		};
		const fromStart: BlockSelection = {
			type: "block",
			blockIds: ["a", "b", "c"],
			head: "a",
		};
		const fromEnd: BlockSelection = {
			type: "block",
			blockIds: ["a", "b", "c"],
			head: "c",
		};

		expect(withoutHead.head).toBeUndefined();
		expect(
			fromStart.head === fromStart.blockIds[0] ||
				fromStart.head === fromStart.blockIds[fromStart.blockIds.length - 1],
		).toBe(true);
		expect(
			fromEnd.head === fromEnd.blockIds[0] ||
				fromEnd.head === fromEnd.blockIds[fromEnd.blockIds.length - 1],
		).toBe(true);
	});

	it("S-types: CellSelection still admits rowIds/columnIds until 5.3 drops them", () => {
		const sel: CellSelection = {
			type: "cell",
			blockId: "table",
			anchor: { row: 0, col: 0 },
			head: { row: 1, col: 2 },
		};

		expect(sel.rowIds).toBeUndefined();
		expect(sel.columnIds).toBeUndefined();
	});

	it("S-types: SelectionRecord is a serializable value with origin and versions", () => {
		const origins: readonly SelectionOrigin[] = [
			"pointer",
			"keyboard",
			"ime",
			"programmatic",
			"mapped",
			"restore",
			"gc",
		];
		const record: SelectionRecord = {
			state: collapsedRecordState("a", 0),
			version: 1,
			origin: "keyboard",
			commitId: 4,
		};

		expect(origins).toHaveLength(7);
		expect(JSON.parse(JSON.stringify(record))).toEqual(record);
	});

	it("S-types: commit snapshot text state requires affinity and goalX", () => {
		const state: SelectionRecordState = collapsedRecordState("b", 2);

		expect(state).toEqual({
			type: "text",
			anchor: { blockId: "b", offset: 2 },
			focus: { blockId: "b", offset: 2 },
			affinity: "downstream",
			goalX: null,
		});
	});

	it("S-types: ReadonlySelectionState is a deep-readonly read shape, not shallow Readonly", () => {
		const live: TextSelection = {
			type: "text",
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "b", offset: 2 },
			isCollapsed: false,
			isMultiBlock: true,
			blockRange: ["a", "b"],
			toRange: () => {
				throw new Error("unused");
			},
		};
		const fromLive: ReadonlySelectionState = live;
		const deepReadonlyText: ReadonlySelectionState = {
			type: "text",
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "b", offset: 2 },
			blockRange: ["a", "b"] as readonly string[],
		};
		const deepReadonlyCell: ReadonlySelectionState = {
			type: "cell",
			blockId: "table",
			anchor: { row: 0, col: 1 },
			head: { row: 1, col: 2 },
			rowIds: ["r0", "r1"] as readonly string[],
		};
		const accepted: readonly ReadonlySelectionState[] = [
			fromLive,
			deepReadonlyText,
			deepReadonlyCell,
			null,
		];

		expect(accepted).toHaveLength(4);
		if (deepReadonlyText?.type === "text") {
			expect(deepReadonlyText.blockRange).toEqual(["a", "b"]);
		}
		const _liveAssigns: ReadonlySelectionState = null as unknown as SelectionState;
		expect(_liveAssigns).toBeNull();
	});
});
