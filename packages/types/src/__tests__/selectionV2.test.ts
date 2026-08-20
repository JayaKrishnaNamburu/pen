import { describe, expect, it } from "vitest";
import type {
  BlockSelectionV2,
  CellSelectionV2,
  SelectionOriginV2,
  SelectionRecordV2,
  TextSelectionV2,
} from "../types/selectionV2";
import {
  getSelectionBlockRange,
  isCollapsed,
  isMultiBlock,
  selectionToRange,
} from "../types/selectionV2";

const DOC = { blockOrder: ["a", "b", "c"] };

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

    expect(sel.affinity).toBe("upstream");
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

  it("A1: isCollapsed is a function, not a property", () => {
    const collapsed = collapsedText("a", 1);
    const expanded: TextSelectionV2 = {
      type: "text",
      anchor: { blockId: "a", offset: 0 },
      focus: { blockId: "a", offset: 4 },
      affinity: "downstream",
      goalX: null,
    };
    const cell: CellSelectionV2 = {
      type: "cell",
      blockId: "table",
      anchor: { row: 0, col: 1 },
      head: { row: 0, col: 1 },
    };

    expect(typeof isCollapsed).toBe("function");
    expect(isCollapsed(collapsed)).toBe(true);
    expect(isCollapsed(expanded)).toBe(false);
    expect(isCollapsed(cell)).toBe(true);
    expect(isCollapsed({ type: "block", blockIds: ["a"], head: "a" })).toBe(
      false,
    );
    expect(isCollapsed({ type: "app", appId: "app-1" })).toBe(false);
    expect(isCollapsed(null)).toBe(false);
  });

  it("S-types: isMultiBlock and getSelectionBlockRange are functions over document order", () => {
    const across: TextSelectionV2 = {
      type: "text",
      anchor: { blockId: "c", offset: 2 },
      focus: { blockId: "a", offset: 0 },
      affinity: "downstream",
      goalX: 8,
    };
    const blocks: BlockSelectionV2 = {
      type: "block",
      blockIds: ["a", "b"],
      head: "b",
    };

    expect(isMultiBlock(across)).toBe(true);
    expect(isMultiBlock(collapsedText("a", 0))).toBe(false);
    expect(isMultiBlock(blocks)).toBe(true);
    expect(getSelectionBlockRange(DOC, across)).toEqual(["a", "b", "c"]);
    expect(getSelectionBlockRange(DOC, blocks)).toEqual(["a", "b"]);
    expect(getSelectionBlockRange(DOC, collapsedText("b", 1))).toEqual(["b"]);
  });

  it("S-types: selectionToRange orders text endpoints; non-text returns null", () => {
    const across: TextSelectionV2 = {
      type: "text",
      anchor: { blockId: "c", offset: 2 },
      focus: { blockId: "a", offset: 1 },
      affinity: "upstream",
      goalX: null,
    };

    expect(selectionToRange(DOC, across)).toEqual({
      start: { blockId: "a", offset: 1 },
      end: { blockId: "c", offset: 2 },
    });
    expect(
      selectionToRange(DOC, { type: "block", blockIds: ["a"], head: "a" }),
    ).toBeNull();
  });
});
