import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import type { DocumentOp } from "@pen/types";
import { jsonExporter } from "../exporter";

type InsertTableCellTextOp = Extract<DocumentOp, { type: "insert-table-cell-text" }>;
type FormatTableCellTextOp = Extract<DocumentOp, { type: "format-table-cell-text" }>;
type UpdateTableColumnsOp = Extract<DocumentOp, { type: "update-table-columns" }>;
type DatabaseInsertRowOp = Extract<DocumentOp, { type: "database-insert-row" }>;

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

function editorWithOps(ops: Parameters<ReturnType<typeof createEditor>["apply"]>[0]) {
  const editor = createEditor({
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
  editor.apply(ops);
  return editor;
}

describe("@pen/export-json", () => {
  it("exports nested blocks and inline marks", async () => {
    const editor = editorWithOps([
      {
        type: "insert-block",
        blockId: "parent",
        blockType: "toggle",
        props: {},
        position: "last",
      },
      {
        type: "insert-block",
        blockId: "child",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "update-block",
        blockId: "child",
        props: { parentId: "parent" },
      },
      {
        type: "insert-text",
        blockId: "child",
        offset: 0,
        text: "hello world",
      },
      {
        type: "format-text",
        blockId: "child",
        offset: 0,
        length: 5,
        marks: { bold: true },
      },
    ]);

    const json = await jsonExporter.export(editor);

    expect(json.blocks).toHaveLength(1);
    expect(json.blocks[0]).toMatchObject({
      id: "parent",
      type: "toggle",
      children: [
        {
          id: "child",
          type: "paragraph",
          content: {
            text: "hello world",
          },
        },
      ],
    });
    expect(json.blocks[0]?.children?.[0]?.content?.marks).toEqual([
      {
        type: "bold",
        start: 0,
        end: 5,
      },
    ]);

    editor.destroy();
  });

  it("exports inline node segments without dropping canonical text content", async () => {
    const editor = editorWithOps([
      {
        type: "insert-block",
        blockId: "paragraph-1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "paragraph-1",
        offset: 0,
        text: "Hello ",
      },
      {
        type: "insert-inline-node",
        blockId: "paragraph-1",
        offset: 6,
        nodeType: "mention",
        props: {
          id: "user-1",
          label: "Ada",
        },
      },
      {
        type: "insert-text",
        blockId: "paragraph-1",
        offset: 7,
        text: " world",
      },
    ]);

    const json = await jsonExporter.export(editor);
    const content = json.blocks[0]?.content;

    expect(content?.text).toBe("Hello  world");
    expect(content?.segments).toEqual([
      { type: "text", text: "Hello " },
      {
        type: "node",
        nodeType: "mention",
        props: {
          id: "user-1",
          label: "Ada",
        },
      },
      { type: "text", text: " world" },
    ]);

    editor.destroy();
  });

  it("exports table cell text and marks through synthetic table children", async () => {
    const editor = editorWithOps([
      {
        type: "insert-block",
        blockId: "table-1",
        blockType: "table",
        props: {},
        position: "last",
      },
      {
        type: "insert-table-cell-text",
        blockId: "table-1",
        row: 0,
        col: 0,
        offset: 0,
        text: "bold",
      } as InsertTableCellTextOp,
      {
        type: "format-table-cell-text",
        blockId: "table-1",
        row: 0,
        col: 0,
        offset: 0,
        length: 4,
        marks: { bold: true },
      } as FormatTableCellTextOp,
    ]);

    const json = await jsonExporter.export(editor);
    const firstCell = json.blocks[0]?.children?.[0]?.children?.[0];

    expect(json.blocks[0]?.type).toBe("table");
    expect(firstCell?.type).toBe("__table_cell");
    expect(firstCell?.content?.text).toBe("bold");
    expect(firstCell?.content?.marks).toEqual([
      {
        type: "bold",
        start: 0,
        end: 4,
      },
    ]);

    editor.destroy();
  });

  it("exports database structured data", async () => {
    const editor = editorWithOps([
      {
        type: "insert-block",
        blockId: "db-1",
        blockType: "database",
        props: { title: "Roadmap", dataSource: "local" },
        position: "last",
      },
      {
        type: "update-table-columns",
        blockId: "db-1",
        columns: [{ id: "name", title: "Name", type: "text" }],
      } as UpdateTableColumnsOp,
      {
        type: "database-insert-row",
        blockId: "db-1",
        rowId: "row-1",
        values: { name: "Ship JSON" },
      } as DatabaseInsertRowOp,
    ]);

    const json = await jsonExporter.export(editor);

    expect(json.blocks[0]).toMatchObject({
      id: "db-1",
      type: "database",
      database: {
        title: "Roadmap",
        columns: [{ id: "name", title: "Name", type: "text" }],
        rows: [{ id: "row-1", values: { name: "Ship JSON" } }],
      },
    });

    editor.destroy();
  });
});
