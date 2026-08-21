import type { BlockHandle } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { getNumberedListItemValue } from "../editor/orderedList";

describe("getNumberedListItemValue", () => {
	it("derives numbered list values from prior siblings at the same indent", () => {
		const firstItem = createNumberedListBlock("b1", null, { start: 3 });
		const secondItem = createNumberedListBlock("b2", firstItem);
		const nestedItem = createNumberedListBlock("b3", secondItem, { indent: 1 });
		const thirdItem = createNumberedListBlock("b4", nestedItem);

		expect(getNumberedListItemValue(firstItem)).toBe(3);
		expect(getNumberedListItemValue(secondItem)).toBe(4);
		expect(getNumberedListItemValue(nestedItem)).toBe(1);
		expect(getNumberedListItemValue(thirdItem)).toBe(5);
	});

	it("returns null for non-numbered blocks", () => {
		expect(
			getNumberedListItemValue({
				id: "p1",
				type: "paragraph",
				props: {},
			} as BlockHandle),
		).toBeNull();
		expect(getNumberedListItemValue(null)).toBeNull();
	});
});

function createNumberedListBlock(
	id: string,
	prev: BlockHandle | null,
	props: Record<string, unknown> = {},
): BlockHandle {
	const handle = {
		id,
		type: "numberedListItem",
		props,
		prev,
		as(capability: string) {
			return capability === "table" && handle.type === "table" ? handle : null;
		},
	};
	return handle as unknown as BlockHandle;
}
