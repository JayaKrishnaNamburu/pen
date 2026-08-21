import type { InlineDecoration } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import {
  createDecorationSet,
  emptyDecorationSet,
  releaseDecorationSet,
} from "../editor/decorations";

function inlineDec(
  blockId: string,
  from: number,
  to: number,
  mark = "x",
): InlineDecoration {
  return {
    type: "inline",
    blockId,
    from,
    to,
    attributes: { mark },
  };
}

describe("SCALE4 decoration release (F.4)", () => {
  it("SCALE4: release empties the block index and the held forBlock arrays", () => {
    const set = createDecorationSet([
      inlineDec("a", 0, 2, "keep-a"),
      inlineDec("b", 1, 3, "keep-b"),
    ]);
    const heldA = set.forBlock("a");
    const heldB = set.forBlock("b");

    expect(heldA).toHaveLength(1);
    expect(heldB).toHaveLength(1);

    releaseDecorationSet(set);

    expect(set.decorations).toHaveLength(0);
    expect(set.forBlock("a")).toHaveLength(0);
    expect(set.forBlock("b")).toHaveLength(0);
    expect(heldA).toHaveLength(0);
    expect(heldB).toHaveLength(0);
  });

  it("SCALE4: release is idempotent and leaves the empty singleton alone", () => {
    const empty = emptyDecorationSet();
    releaseDecorationSet(empty);
    expect(emptyDecorationSet()).toBe(empty);
    expect(empty.decorations).toHaveLength(0);

    const set = createDecorationSet([inlineDec("a", 0, 1)]);
    releaseDecorationSet(set);
    releaseDecorationSet(set);
    expect(set.decorations).toHaveLength(0);
    expect(set.forBlock("a")).toHaveLength(0);
  });

  it("SCALE4: createDecorationSet([]) is the empty singleton and does not allocate an index", () => {
    const a = createDecorationSet([]);
    const b = emptyDecorationSet();
    expect(a).toBe(b);
    expect(a.forBlock("missing")).toHaveLength(0);
  });
});
