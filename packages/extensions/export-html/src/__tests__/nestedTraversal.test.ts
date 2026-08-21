import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { DocumentOp } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema-default";
import { htmlExporter } from "../exporter";

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

describe("HTML export nested traversal", () => {
  it("exports nested children, layout children, table cells, and list items", () => {
    const editor = createBareEditor();
    editor.apply(nestedDocumentOps());

    const toggle = editor.getBlock("toggle-1");
    const callout = editor.getBlock("callout-1");
    expect(toggle?.children.some((child) => child.id === "toggle-child")).toBe(
      true,
    );
    expect(callout?.children.some((child) => child.id === "callout-child")).toBe(
      true,
    );
    expect(
      [...editor.documentState.allBlocks()].some(
        (handle) => handle.id === "toggle-child" && handle.parent !== null,
      ),
    ).toBe(true);

    const html = htmlExporter.export(editor);
    if (typeof html !== "string") {
      throw new Error("Expected synchronous HTML export.");
    }

    for (const marker of Object.values(MARKERS)) {
      expect(html).toContain(marker);
    }

    editor.destroy();
  });
});
