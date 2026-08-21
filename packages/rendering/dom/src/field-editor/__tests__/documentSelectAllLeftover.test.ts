import { describe, expect, it } from "vitest";
import type { SelectionState } from "@input/pen-types";
import { shouldIgnoreLeftoverFieldAfterDocumentSelectAll } from "../documentSelectAllLeftover";

const first = { blockId: "first", offset: 0 };
const firstEnd = { blockId: "first", offset: 5 };
const thirdEnd = { blockId: "third", offset: 5 };

function textSelection(
	anchor: { blockId: string; offset: number },
	focus: { blockId: string; offset: number },
): SelectionState {
	return {
		type: "text",
		anchor,
		focus,
		isCollapsed:
			anchor.blockId === focus.blockId && anchor.offset === focus.offset,
		isMultiBlock: anchor.blockId !== focus.blockId,
		blockRange: [anchor.blockId, focus.blockId],
		toRange: () => {
			throw new Error("unused");
		},
	};
}

describe("shouldIgnoreLeftoverFieldAfterDocumentSelectAll", () => {
	it("ignores a single-field leftover while authority is a multi-block text range", () => {
		expect(
			shouldIgnoreLeftoverFieldAfterDocumentSelectAll(
				textSelection(first, thirdEnd),
				{ type: "text", anchor: first, focus: firstEnd },
			),
		).toBe(true);
	});

	it("does not ignore when authority is already a single-block range", () => {
		expect(
			shouldIgnoreLeftoverFieldAfterDocumentSelectAll(
				textSelection(first, firstEnd),
				{ type: "text", anchor: first, focus: firstEnd },
			),
		).toBe(false);
	});

	it("does not ignore a native multi-block proposal", () => {
		expect(
			shouldIgnoreLeftoverFieldAfterDocumentSelectAll(
				textSelection(first, thirdEnd),
				{ type: "text", anchor: first, focus: thirdEnd },
			),
		).toBe(false);
	});

	it("does not ignore a native block selection", () => {
		expect(
			shouldIgnoreLeftoverFieldAfterDocumentSelectAll(
				textSelection(first, thirdEnd),
				{ type: "block" },
			),
		).toBe(false);
	});
});
