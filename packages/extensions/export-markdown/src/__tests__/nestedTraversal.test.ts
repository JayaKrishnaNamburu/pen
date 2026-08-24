import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { DocumentOp } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema-default";
import { markdownExporter } from "../exporter";

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
    { type: "splice-text", blockId: "h1", from: 0,
				to: 0,
				insert: MARKERS.heading },
    {
      type: "insert-block",
      blockId: "toggle-1",
      blockType: "toggle",
      props: {},
      position: "last",
    },
    { type: "splice-text", blockId: "toggle-1", from: 0,
				to: 0,
				insert: MARKERS.toggleTitle },
    {
      type: "insert-block",
      blockId: "toggle-child",
      blockType: "paragraph",
      props: {},
      position: { parent: "toggle-1", index: 0 },
    },
    {
      type: "splice-text",
      blockId: "toggle-child",
      from: 0,
				to: 0,
				insert: MARKERS.toggleChild,
    },
    {
      type: "insert-block",
      blockId: "callout-1",
      blockType: "callout",
      props: { severity: "info" },
      position: "last",
    },
    { type: "splice-text", blockId: "callout-1", from: 0,
				to: 0,
				insert: "CALLOUT-TITLE" },
    {
      type: "insert-block",
      blockId: "callout-child",
      blockType: "paragraph",
      props: {},
      position: { parent: "callout-1", index: 0 },
    },
    {
      type: "splice-text",
      blockId: "callout-child",
      from: 0,
				to: 0,
				insert: MARKERS.calloutChild,
    },
    {
      type: "insert-block",
      blockId: "t1",
      blockType: "table",
      props: { hasHeaderRow: true },
      position: "last",
    },
    {
      type: "splice-text",
      blockId: "t1",
      cell: { row: 0, col: 0 },
      from: 0,
      to: 0,
      insert: MARKERS.tableCell,
    },
    {
      type: "insert-block",
      blockId: "l1",
      blockType: "bulletListItem",
      props: {},
      position: "last",
    },
    { type: "splice-text", blockId: "l1", from: 0,
				to: 0,
				insert: MARKERS.listFirst },
    {
      type: "insert-block",
      blockId: "l2",
      blockType: "bulletListItem",
      props: { indent: 1 },
      position: "last",
    },
    { type: "splice-text", blockId: "l2", from: 0,
				to: 0,
				insert: MARKERS.listNested },
  ];
}

describe("Markdown export nested traversal", () => {
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

    const markdown = markdownExporter.export(editor);
    if (typeof markdown !== "string") {
      throw new Error("Expected synchronous markdown export.");
    }

    for (const marker of Object.values(MARKERS)) {
      expect(markdown).toContain(marker);
    }

    // Flattening is the markdown contract: children are siblings after the
    // parent construct, not dropped and not nested inside details/blockquote.
    expect(markdown).toContain("<summary>TOGGLE-TITLE</summary>");
    expect(markdown).not.toMatch(
      /<details>[\s\S]*NESTED-TOGGLE-CHILD[\s\S]*<\/details>/,
    );
    expect(markdown).toMatch(/<\/details>\s+NESTED-TOGGLE-CHILD/);
    expect(markdown).toContain("> **Note:** CALLOUT-TITLE");
    expect(markdown).toMatch(
      /> \*\*Note:\*\* CALLOUT-TITLE\s+NESTED-CALLOUT-CHILD/,
    );
    expect(markdown).toContain(MARKERS.tableCell);
    expect(markdown).toContain("- LIST-ITEM-FIRST\n  - LIST-ITEM-NESTED");

    editor.destroy();
  });
});
