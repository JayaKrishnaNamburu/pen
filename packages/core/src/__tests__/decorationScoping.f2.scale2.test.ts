import type {
  BlockDecoration,
  Decoration,
  InlineDecoration,
  PositionMapping,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import {
  createDecorationSet,
  emptyDecorationSet,
  recomputeDecorations,
  updateDecorationsForAffectedBlocks,
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

function blockDec(blockId: string, mark = "x"): BlockDecoration {
  return {
    type: "block",
    blockId,
    attributes: { mark },
  };
}

function mappingFor(
  affectedBlocks: readonly string[],
  shift = 1,
): PositionMapping {
  return {
    affectedBlocks,
    mapOffset(blockId, offset) {
      return affectedBlocks.includes(blockId) ? offset + shift : offset;
    },
  };
}

describe("SCALE2 decoration scoping (F.2)", () => {
  it("SCALE2: a one-block update keeps the untouched forBlock array by identity", () => {
    const previous = createDecorationSet([
      inlineDec("a", 0, 2, "keep-a"),
      inlineDec("b", 0, 3, "keep-b"),
      blockDec("c", "keep-c"),
    ]);
    const untouchedB = previous.forBlock("b");
    const untouchedC = previous.forBlock("c");
    const previousA = previous.forBlock("a");

    const next = updateDecorationsForAffectedBlocks(previous, ["a"], [
      inlineDec("a", 0, 4, "next-a"),
    ]);

    expect(next).not.toBe(previous);
    expect(next.forBlock("a")).not.toBe(previousA);
    expect(next.forBlock("a")).toEqual([inlineDec("a", 0, 4, "next-a")]);
    expect(next.forBlock("b")).toBe(untouchedB);
    expect(next.forBlock("c")).toBe(untouchedC);
    expect(next.forBlock("b")).toEqual(untouchedB);
  });

  it("SCALE2: equal decorations for the affected block return the previous set by identity", () => {
    const previous = createDecorationSet([
      inlineDec("a", 0, 2, "same"),
      inlineDec("b", 0, 3, "keep-b"),
    ]);
    const untouchedB = previous.forBlock("b");

    const next = updateDecorationsForAffectedBlocks(previous, ["a"], [
      inlineDec("a", 0, 2, "same"),
    ]);

    expect(next).toBe(previous);
    expect(next.forBlock("b")).toBe(untouchedB);
  });

  it("SCALE2: an empty affected set is a no-op and keeps the set object", () => {
    const previous = createDecorationSet([inlineDec("a", 0, 1)]);
    expect(updateDecorationsForAffectedBlocks(previous, [], [inlineDec("a", 0, 9)])).toBe(
      previous,
    );
  });

  it("SCALE2: decorations for blocks outside the affected set are ignored", () => {
    const previous = createDecorationSet([
      inlineDec("a", 0, 1, "old-a"),
      inlineDec("b", 0, 1, "old-b"),
    ]);
    const untouchedB = previous.forBlock("b");

    const next = updateDecorationsForAffectedBlocks(previous, ["a"], [
      inlineDec("a", 0, 2, "new-a"),
      inlineDec("b", 0, 9, "smuggle-b"),
    ]);

    expect(next.forBlock("a")).toEqual([inlineDec("a", 0, 2, "new-a")]);
    expect(next.forBlock("b")).toBe(untouchedB);
    expect(next.forBlock("b")).toEqual([inlineDec("b", 0, 1, "old-b")]);
  });

  it("SCALE2: clearing the affected block drops only that index entry", () => {
    const previous = createDecorationSet([
      inlineDec("a", 0, 1),
      inlineDec("b", 0, 1),
    ]);
    const untouchedB = previous.forBlock("b");

    const next = updateDecorationsForAffectedBlocks(previous, ["a"], []);

    expect(next.forBlock("a")).toBe(emptyDecorationSet().forBlock("missing"));
    expect(next.forBlock("a")).toHaveLength(0);
    expect(next.forBlock("b")).toBe(untouchedB);
  });

  it("SCALE2: map remaps one block and keeps the others by identity", () => {
    const previous = createDecorationSet([
      inlineDec("a", 0, 2),
      inlineDec("b", 1, 4),
      blockDec("c"),
    ]);
    const untouchedB = previous.forBlock("b");
    const untouchedC = previous.forBlock("c");

    const next = previous.map(mappingFor(["a"], 3));

    expect(next).not.toBe(previous);
    expect(next.forBlock("a")).toEqual([inlineDec("a", 3, 5)]);
    expect(next.forBlock("b")).toBe(untouchedB);
    expect(next.forBlock("c")).toBe(untouchedC);
  });

  it("SCALE2: map returns the same set when offsets do not move", () => {
    const previous = createDecorationSet([
      inlineDec("a", 0, 2),
      inlineDec("b", 1, 4),
    ]);
    expect(previous.map(mappingFor(["a"], 0))).toBe(previous);
  });

  it("SCALE2: eight no-op providers run once per commit, not once per block", () => {
    const previousDecorations: Decoration[] = [];
    for (let i = 1; i <= 20; i++) {
      previousDecorations.push(inlineDec(`b${i}`, 0, 1, `m${i}`));
    }
    const previous = createDecorationSet(previousDecorations);
    const untouched = previous.forBlock("b1");

    const counts = [0, 0, 0, 0, 0, 0, 0, 0];
    const seen: string[][] = [];
    const providers = counts.map((_, index) => {
      return (affectedBlocks: readonly string[]) => {
        counts[index] += 1;
        seen.push([...affectedBlocks]);
        return emptyDecorationSet();
      };
    });

    const next = recomputeDecorations(previous, ["b7"], providers);

    expect(counts).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(seen).toHaveLength(8);
    for (const args of seen) {
      expect(args).toEqual(["b7"]);
    }
    expect(next.forBlock("b1")).toBe(untouched);
    expect(next.forBlock("b7")).toHaveLength(0);
  });

  it("SCALE2: a participating provider is invoked once and only for the affected block", () => {
    const previous = createDecorationSet([
      inlineDec("a", 0, 1, "old-a"),
      inlineDec("b", 0, 1, "old-b"),
    ]);
    const untouchedB = previous.forBlock("b");
    let calls = 0;
    let seen: readonly string[] = [];

    const next = recomputeDecorations(previous, ["a"], [
      (affectedBlocks) => {
        calls += 1;
        seen = affectedBlocks;
        return [inlineDec("a", 0, 4, "next-a")];
      },
    ]);

    expect(calls).toBe(1);
    expect(seen).toEqual(["a"]);
    expect(next.forBlock("a")).toEqual([inlineDec("a", 0, 4, "next-a")]);
    expect(next.forBlock("b")).toBe(untouchedB);
  });
});
