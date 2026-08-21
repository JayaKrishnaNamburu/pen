import { EMPTY_BLOCK_SENTINEL } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import {
	CLOSED_GESTURE_WINDOWS,
	isAdmissibleDomRead,
	isLogicallyEquivalent,
	nextGestureWindowState,
	type GestureWindowState,
	type ReaderSelection,
	type ReaderSnapshot,
} from "../selectionReader";

function textSelection(
	anchor: { blockId: string; offset: number },
	focus: { blockId: string; offset: number } = anchor,
): ReaderSelection {
	return { type: "text", anchor, focus };
}

describe("isLogicallyEquivalent", () => {
	describe("empty block", () => {
		const snapshot: ReaderSnapshot = {
			blockOrder: ["empty"],
			blocks: {
				empty: { kind: "text", text: EMPTY_BLOCK_SENTINEL },
			},
		};
		const authority = textSelection({ blockId: "empty", offset: 0 });

		it("E2 §2: DOM offset 1 in a sentinel-only block equals authority 0", () => {
			expect(
				isLogicallyEquivalent(
					textSelection({ blockId: "empty", offset: 1 }),
					authority,
					snapshot,
				),
			).toBe(true);
		});

		it("E2 §2: DOM offset 0 in a sentinel-only block equals authority 0", () => {
			expect(isLogicallyEquivalent(authority, authority, snapshot)).toBe(
				true,
			);
		});

		it("E2 §2: a caret on a different empty-block id is not equivalent", () => {
			const other: ReaderSnapshot = {
				blockOrder: ["empty", "other"],
				blocks: {
					empty: { kind: "text", text: EMPTY_BLOCK_SENTINEL },
					other: { kind: "text", text: EMPTY_BLOCK_SENTINEL },
				},
			};
			expect(
				isLogicallyEquivalent(
					textSelection({ blockId: "other", offset: 1 }),
					authority,
					other,
				),
			).toBe(false);
		});
	});

	describe("inline atom", () => {
		const snapshot: ReaderSnapshot = {
			blockOrder: ["embed"],
			blocks: {
				embed: {
					kind: "text",
					text: "hello",
					atoms: [{ start: 1, end: 4 }],
				},
			},
		};
		const beforeAtom = textSelection({ blockId: "embed", offset: 1 });
		const afterAtom = textSelection({ blockId: "embed", offset: 4 });

		it("E2 N1: the same atom side is equivalent", () => {
			expect(
				isLogicallyEquivalent(beforeAtom, beforeAtom, snapshot),
			).toBe(true);
			expect(isLogicallyEquivalent(afterAtom, afterAtom, snapshot)).toBe(
				true,
			);
		});

		it("E2 N1: opposite atom sides are not equivalent", () => {
			expect(
				isLogicallyEquivalent(beforeAtom, afterAtom, snapshot),
			).toBe(false);
			expect(
				isLogicallyEquivalent(afterAtom, beforeAtom, snapshot),
			).toBe(false);
		});

		it("E2 N1: an interior offset snaps downstream to the atom end", () => {
			const interior = textSelection({ blockId: "embed", offset: 2 });
			expect(isLogicallyEquivalent(interior, afterAtom, snapshot)).toBe(
				true,
			);
			expect(isLogicallyEquivalent(interior, beforeAtom, snapshot)).toBe(
				false,
			);
		});
	});

	describe("multi-block range", () => {
		const snapshot: ReaderSnapshot = {
			blockOrder: ["p1", "p2", "p3"],
			blocks: {
				p1: { kind: "text", text: "alpha" },
				p2: { kind: "text", text: "bravo" },
				p3: { kind: "text", text: "charlie" },
			},
		};
		const range = textSelection(
			{ blockId: "p1", offset: 0 },
			{ blockId: "p2", offset: 5 },
		);

		it("E2 §4.2: the same multi-block range is equivalent", () => {
			expect(isLogicallyEquivalent(range, range, snapshot)).toBe(true);
		});

		it("E2 §4.2: a leftover single-block range is not equivalent", () => {
			expect(
				isLogicallyEquivalent(
					textSelection(
						{ blockId: "p1", offset: 0 },
						{ blockId: "p1", offset: 5 },
					),
					range,
					snapshot,
				),
			).toBe(false);
		});

		it("E2 §4.2: a reversed multi-block range is not equivalent", () => {
			expect(
				isLogicallyEquivalent(
					textSelection(
						{ blockId: "p2", offset: 5 },
						{ blockId: "p1", offset: 0 },
					),
					range,
					snapshot,
				),
			).toBe(false);
		});

		it("E2 §4.2: a wider p1–p3 range is not equivalent", () => {
			expect(
				isLogicallyEquivalent(
					textSelection(
						{ blockId: "p1", offset: 0 },
						{ blockId: "p3", offset: 7 },
					),
					range,
					snapshot,
				),
			).toBe(false);
		});
	});

	it("E2: null matches only null", () => {
		const snapshot: ReaderSnapshot = {
			blockOrder: ["p1"],
			blocks: { p1: { kind: "text", text: "x" } },
		};
		expect(isLogicallyEquivalent(null, null, snapshot)).toBe(true);
		expect(
			isLogicallyEquivalent(
				textSelection({ blockId: "p1", offset: 0 }),
				null,
				snapshot,
			),
		).toBe(false);
	});
});

describe("gesture windows §4.1", () => {
	function apply(
		eventKind: Parameters<typeof nextGestureWindowState>[0],
		state: GestureWindowState = CLOSED_GESTURE_WINDOWS,
	): GestureWindowState {
		return nextGestureWindowState(eventKind, state);
	}

	describe("pointer", () => {
		it("opens on pointerdown and admits the following selectionchange", () => {
			const state = apply("pointerdown");
			expect(state.pointer).toBe(true);
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(true);
		});

		it("does not close on pointerup", () => {
			const state = apply("pointerup", apply("pointerdown"));
			expect(state.pointer).toBe(true);
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(true);
		});

		it("closes on pointer-settled after pointerup", () => {
			const state = apply(
				"pointer-settled",
				apply("pointerup", apply("pointerdown")),
			);
			expect(state.pointer).toBe(false);
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(false);
		});
	});

	describe("ime", () => {
		it("opens on compositionstart and admits selectionchange", () => {
			const state = apply("compositionstart");
			expect(state.ime).toBe(true);
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(true);
		});

		it("stays open across keydown during composition", () => {
			const state = apply("keydown", apply("compositionstart"));
			expect(state.ime).toBe(true);
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(true);
		});

		it("closes when compositionend handling is completed", () => {
			const state = apply(
				"compositionend-completed",
				apply("compositionstart"),
			);
			expect(state.ime).toBe(false);
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(false);
		});
	});

	describe("context-menu", () => {
		it("opens on contextmenu and admits the next selectionchange", () => {
			const state = apply("contextmenu");
			expect(state.contextMenu).toBe(true);
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(true);
		});

		it("closes on that selectionchange so a later read is rejected", () => {
			const during = apply("contextmenu");
			expect(isAdmissibleDomRead("selectionchange", during)).toBe(true);
			const after = apply("selectionchange", during);
			expect(after.contextMenu).toBe(false);
			expect(isAdmissibleDomRead("selectionchange", after)).toBe(false);
		});
	});

	describe("drag", () => {
		it("opens on dragstart and admits selectionchange", () => {
			const state = apply("dragstart");
			expect(state.drag).toBe(true);
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(true);
		});

		it("closes on drop-completed and on dragend-completed", () => {
			expect(apply("drop-completed", apply("dragstart")).drag).toBe(
				false,
			);
			expect(apply("dragend-completed", apply("dragstart")).drag).toBe(
				false,
			);
		});
	});

	describe("keyboard", () => {
		it("does not open a window on keydown or keyup", () => {
			expect(apply("keydown")).toEqual(CLOSED_GESTURE_WINDOWS);
			expect(apply("keyup")).toEqual(CLOSED_GESTURE_WINDOWS);
		});

		it("rejects a selectionchange after only keyboard events", () => {
			const state = apply("keyup", apply("keydown"));
			expect(isAdmissibleDomRead("selectionchange", state)).toBe(false);
		});

		it("never treats keydown itself as an admissible DOM read", () => {
			expect(
				isAdmissibleDomRead("keydown", apply("pointerdown")),
			).toBe(false);
		});
	});

	it("rejects a selectionchange when every window is closed", () => {
		expect(
			isAdmissibleDomRead("selectionchange", CLOSED_GESTURE_WINDOWS),
		).toBe(false);
	});
});
