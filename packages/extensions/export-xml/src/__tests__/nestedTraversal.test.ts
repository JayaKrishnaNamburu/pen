import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { DocumentOp } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema-default";
import { xmlExporter } from "../exporter";
import { xmlImporter } from "../importer";

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

function expectChildNestedInParent(
  xml: string,
  parentId: string,
  childId: string,
): void {
  const parentStart = xml.indexOf(`<block id="${parentId}"`);
  const childrenStart = xml.indexOf("<children>", parentStart);
  const childStart = xml.indexOf(`<block id="${childId}"`, childrenStart);
  expect(parentStart).toBeGreaterThan(-1);
  expect(childrenStart).toBeGreaterThan(parentStart);
  expect(childStart).toBeGreaterThan(childrenStart);
}

describe("XML export nested traversal", () => {
  it("nests layout children and keeps table and list content", async () => {
    const editor = createBareEditor();
    editor.apply(nestedDocumentOps());

    const xml = await xmlExporter.export(editor);
    if (typeof xml !== "string") {
      throw new Error("Expected synchronous XML export.");
    }

    expectChildNestedInParent(xml, "toggle-1", "toggle-child");
    expectChildNestedInParent(xml, "callout-1", "callout-child");

    for (const marker of Object.values(MARKERS)) {
      expect(xml).toContain(marker);
    }

    editor.destroy();
  });

  it("round-trips nested children, a table, and a list", async () => {
    const source = createBareEditor();
    source.apply(nestedDocumentOps());

    const exported = await xmlExporter.export(source);
    const target = createBareEditor();
    await xmlImporter.import(exported, target, { replace: true });
    const reexported = await xmlExporter.export(target);

    expect(reexported).toEqual(exported);
    for (const marker of Object.values(MARKERS)) {
      expect(reexported).toContain(marker);
    }

    source.destroy();
    target.destroy();
  });
});
