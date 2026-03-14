import type { BlockHandle } from "@pen/types";
import { describe, expect, it } from "vitest";
import { getNumberedListItemValue } from "../orderedList";

describe("@pen/markdown-serialization", () => {
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
});

function createNumberedListBlock(
  id: string,
  prev: BlockHandle | null,
  props: Record<string, unknown> = {},
) : BlockHandle {
  return {
    id,
    type: "numberedListItem",
    props,
    prev,
  } as unknown as BlockHandle;
}
