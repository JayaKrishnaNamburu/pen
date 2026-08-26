import { describe, expect, it } from "vitest";
import type { SelectionState } from "@input/pen-types";
import { isSingleFieldNativeLeftover } from "../singleFieldNativeLeftover";

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
	};
}

describe("isSingleFieldNativeLeftover", () => {
	it("ignores a single-field leftover while authority is a multi-block text range", () => {
		expect(
			isSingleFieldNativeLeftover(textSelection(first, thirdEnd), {
				type: "text",
				anchor: first,
				focus: firstEnd,
			}),
		).toBe(true);
	});

	it("does not ignore when authority is already a single-block range", () => {
		expect(
			isSingleFieldNativeLeftover(textSelection(first, firstEnd), {
				type: "text",
				anchor: first,
				focus: firstEnd,
			}),
		).toBe(false);
	});

	it("does not ignore a native multi-block proposal", () => {
		expect(
			isSingleFieldNativeLeftover(textSelection(first, thirdEnd), {
				type: "text",
				anchor: first,
				focus: thirdEnd,
			}),
		).toBe(false);
	});

	it("does not ignore a native block selection", () => {
		expect(
			isSingleFieldNativeLeftover(textSelection(first, thirdEnd), {
				type: "block",
			}),
		).toBe(false);
	});

	it("does not ignore a collapsed caret: a click inside a multi-block selection is real intent", () => {
		expect(
			isSingleFieldNativeLeftover(textSelection(first, thirdEnd), {
				type: "text",
				anchor: { blockId: "first", offset: 2 },
				focus: { blockId: "first", offset: 2 },
			}),
		).toBe(false);
	});
});
