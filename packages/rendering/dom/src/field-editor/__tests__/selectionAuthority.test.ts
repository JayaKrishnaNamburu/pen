import { describe, expect, it } from "vitest";
import {
	FieldEditorSelectionAuthority,
	resolveLiveTextSelection,
	resolveRestoreTextEndpoints,
} from "../selectionAuthority";

const BLOCK_ID = "block-1";

describe("resolveLiveTextSelection", () => {
	it("accepts a same-block text selection when no cell is active", () => {
		expect(
			resolveLiveTextSelection(
				{
					type: "text",
					anchor: { blockId: BLOCK_ID, offset: 0 },
					focus: { blockId: BLOCK_ID, offset: 30 },
				},
				BLOCK_ID,
				null,
			),
		).toEqual({
			type: "text",
			anchor: { blockId: BLOCK_ID, offset: 0 },
			focus: { blockId: BLOCK_ID, offset: 30 },
		});
	});

	it("rejects a selection that ends in another block", () => {
		expect(
			resolveLiveTextSelection(
				{
					type: "text",
					anchor: { blockId: BLOCK_ID, offset: 0 },
					focus: { blockId: "block-2", offset: 2 },
				},
				BLOCK_ID,
				null,
			),
		).toBeNull();
	});

	it("rejects a non-text selection", () => {
		expect(
			resolveLiveTextSelection({ type: "block" }, BLOCK_ID, null),
		).toBeNull();
	});

	it("rejects a block-level selection while a cell is active", () => {
		expect(
			resolveLiveTextSelection(
				{
					type: "text",
					anchor: { blockId: BLOCK_ID, offset: 0 },
					focus: { blockId: BLOCK_ID, offset: 0 },
				},
				BLOCK_ID,
				{ row: 0, col: 0 },
			),
		).toBeNull();
	});
});

describe("resolveRestoreTextEndpoints", () => {
	it("prefers a live authority range over a leftover collapsed stamp", () => {
		const restored = resolveRestoreTextEndpoints(
			BLOCK_ID,
			{
				type: "text",
				anchor: { blockId: BLOCK_ID, offset: 0 },
				focus: { blockId: BLOCK_ID, offset: 30 },
			},
			{
				blockId: BLOCK_ID,
				anchorOffset: 30,
				focusOffset: 30,
			},
		);

		expect(restored).toEqual({
			anchor: { blockId: BLOCK_ID, offset: 0 },
			focus: { blockId: BLOCK_ID, offset: 30 },
		});
	});

	it("prefers a live collapsed caret over a leftover range stamp", () => {
		const restored = resolveRestoreTextEndpoints(
			BLOCK_ID,
			{
				type: "text",
				anchor: { blockId: BLOCK_ID, offset: 3 },
				focus: { blockId: BLOCK_ID, offset: 3 },
			},
			{
				blockId: BLOCK_ID,
				anchorOffset: 1,
				focusOffset: 5,
			},
		);

		expect(restored).toEqual({
			anchor: { blockId: BLOCK_ID, offset: 3 },
			focus: { blockId: BLOCK_ID, offset: 3 },
		});
	});

	it("falls back to the programmatic stamp when no live selection addresses the field", () => {
		const restored = resolveRestoreTextEndpoints(BLOCK_ID, null, {
			blockId: BLOCK_ID,
			anchorOffset: 4,
			focusOffset: 9,
		});

		expect(restored).toEqual({
			anchor: { blockId: BLOCK_ID, offset: 4 },
			focus: { blockId: BLOCK_ID, offset: 9 },
		});
	});

	it("keeps the cell-scoped stamp when a cell gates the live selection out", () => {
		const cellCaret = {
			blockId: BLOCK_ID,
			anchorOffset: 1,
			focusOffset: 1,
		};
		const blockLevelSelection = {
			type: "text",
			anchor: { blockId: BLOCK_ID, offset: 0 },
			focus: { blockId: BLOCK_ID, offset: 0 },
		} as const;

		const restored = resolveRestoreTextEndpoints(
			BLOCK_ID,
			resolveLiveTextSelection(blockLevelSelection, BLOCK_ID, {
				row: 0,
				col: 0,
			}),
			cellCaret,
		);

		expect(restored).toEqual({
			anchor: { blockId: BLOCK_ID, offset: 1 },
			focus: { blockId: BLOCK_ID, offset: 1 },
		});
	});
});

describe("FieldEditorSelectionAuthority.withSelectionWrite", () => {
	it("mutes during the write and releases in the same turn", () => {
		const authority = new FieldEditorSelectionAuthority();
		let depthDuringWrite = -1;

		const result = authority.withSelectionWrite(() => {
			depthDuringWrite = authority.isApplyingSelection;
			return "written";
		});

		expect(depthDuringWrite).toBe(1);
		expect(authority.isApplyingSelection).toBe(0);
		expect(result).toBe("written");
	});

	it("releases nested writes from the inside out in the same turn", () => {
		const authority = new FieldEditorSelectionAuthority();
		const depths: number[] = [];

		authority.withSelectionWrite(() => {
			depths.push(authority.isApplyingSelection);
			authority.withSelectionWrite(() => {
				depths.push(authority.isApplyingSelection);
			});
			depths.push(authority.isApplyingSelection);
		});

		expect(depths).toEqual([1, 2, 1]);
		expect(authority.isApplyingSelection).toBe(0);
	});

	it("does not schedule requestAnimationFrame", () => {
		const authority = new FieldEditorSelectionAuthority();
		const rafCalls: unknown[] = [];
		const previous = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			rafCalls.push(cb);
			return 1;
		}) as typeof requestAnimationFrame;

		try {
			authority.withSelectionWrite(() => {
				expect(authority.isApplyingSelection).toBe(1);
			});
		} finally {
			if (previous) {
				globalThis.requestAnimationFrame = previous;
			} else {
				delete (globalThis as { requestAnimationFrame?: unknown })
					.requestAnimationFrame;
			}
		}

		expect(rafCalls).toEqual([]);
		expect(authority.isApplyingSelection).toBe(0);
		expect("applySelectionUntilNextFrame" in authority).toBe(false);
	});
});
