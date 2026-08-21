import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { DocumentOp } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema-default";
import { jsonExporter } from "../exporter";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

const MARKERS = {
  heading: "HEADING-TOP",
  toggleTitle: "TOGGLE-TITLE",
  toggleChild: "NESTED-TOGGLE-CHILD",
  calloutChild: "NESTED-CALLOUT-CHILD",
  tableCell: "TABLE-CELL-ALICE",
  listFirst: "LIST-ITEM-FIRST",
  listNested: "LIST-ITEM-NESTED",
} as const;

function createBareEditor() {
  const editor = createEditor({
    schema: defaultSchema,
    preset: noDefaultExtensionsPreset,
  });
  const existingBlockIds = [...editor.documentState.allBlocks()]
    .filter((handle) => handle.parent === null)
    .map((handle) => handle.id);
  if (existingBlockIds.length > 0) {
    editor.apply(
      existingBlockIds.reverse().map((blockId) => ({
        type: "delete-block" as const,
        blockId,
      })),
    );
  }
  return editor;
}

function nestedDocumentOps(): DocumentOp[] {
  return [
    {
      type: "insert-block",
      blockId: "h1",
      blockType: "heading",
      props: { level: 1 },
      position: "last",
    },
    { type: "insert-text", blockId: "h1", offset: 0, text: MARKERS.heading },
    {
      type: "insert-block",
      blockId: "toggle-1",
      blockType: "toggle",
      props: {},
      position: "last",
    },
    { type: "insert-text", blockId: "toggle-1", offset: 0, text: MARKERS.toggleTitle },
    {
      type: "insert-block",
      blockId: "toggle-child",
      blockType: "paragraph",
      props: {},
      position: { parent: "toggle-1", index: 0 },
    },
    {
      type: "insert-text",
      blockId: "toggle-child",
      offset: 0,
      text: MARKERS.toggleChild,
    },
    {
      type: "insert-block",
      blockId: "callout-1",
      blockType: "callout",
      props: { type: "info" },
      position: "last",
    },
    { type: "insert-text", blockId: "callout-1", offset: 0, text: "CALLOUT-TITLE" },
    {
      type: "insert-block",
      blockId: "callout-child",
      blockType: "paragraph",
      props: {},
      position: { parent: "callout-1", index: 0 },
    },
    {
      type: "insert-text",
      blockId: "callout-child",
      offset: 0,
      text: MARKERS.calloutChild,
    },
    {
      type: "insert-block",
      blockId: "t1",
      blockType: "table",
      props: { hasHeaderRow: true },
      position: "last",
    },
    {
      type: "insert-table-cell-text",
      blockId: "t1",
      row: 0,
      col: 0,
      offset: 0,
      text: MARKERS.tableCell,
    },
    {
      type: "insert-block",
      blockId: "l1",
      blockType: "bulletListItem",
      props: {},
      position: "last",
    },
    { type: "insert-text", blockId: "l1", offset: 0, text: MARKERS.listFirst },
    {
      type: "insert-block",
      blockId: "l2",
      blockType: "bulletListItem",
      props: { indent: 1 },
      position: "last",
    },
    { type: "insert-text", blockId: "l2", offset: 0, text: MARKERS.listNested },
  ];
}

describe("JSON export nested traversal", () => {
  it("nests layout children and keeps table and list content", async () => {
    const editor = createBareEditor();
    editor.apply(nestedDocumentOps());

    const json = await jsonExporter.export(editor);
    const topIds = json.blocks.map((block) => block.id);
    expect(topIds).toEqual(["h1", "toggle-1", "callout-1", "t1", "l1", "l2"]);
    expect(topIds).not.toContain("toggle-child");
    expect(topIds).not.toContain("callout-child");

    const toggle = json.blocks.find((block) => block.id === "toggle-1");
    const callout = json.blocks.find((block) => block.id === "callout-1");
    expect(toggle?.children).toHaveLength(1);
    expect(toggle?.children?.[0]?.id).toBe("toggle-child");
    expect(toggle?.children?.[0]?.content?.text).toBe(MARKERS.toggleChild);
    expect(callout?.children).toHaveLength(1);
    expect(callout?.children?.[0]?.id).toBe("callout-child");
    expect(callout?.children?.[0]?.content?.text).toBe(MARKERS.calloutChild);

    const table = json.blocks.find((block) => block.id === "t1");
    expect(table?.children?.[0]?.children?.[0]?.content?.text).toBe(
      MARKERS.tableCell,
    );

    const listTexts = json.blocks
      .filter((block) => block.type === "bulletListItem")
      .map((block) => block.content?.text);
    expect(listTexts).toEqual([MARKERS.listFirst, MARKERS.listNested]);

    editor.destroy();
  });
});
