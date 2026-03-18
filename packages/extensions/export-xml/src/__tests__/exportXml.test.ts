import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import type { DocumentOp } from "@pen/types";
import { xmlExporter } from "../exporter";

type InsertTableCellTextOp = Extract<DocumentOp, { type: "insert-table-cell-text" }>;
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

describe("@pen/export-xml", () => {
  it("exports nested blocks and marks as XML", async () => {
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

    const xml = await xmlExporter.export(editor);

    expect(xml).toContain('<pen-document version="1">');
    expect(xml).toContain('<block id="parent" type="toggle">');
    expect(xml).toContain('<block id="child" type="paragraph">');
    expect(xml).toContain("<content>hello world</content>");
    expect(xml).toContain('<mark type="bold" start="0" end="5" />');

    editor.destroy();
  });

  it("exports inline node segments as explicit XML content runs", async () => {
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
        props: { id: "user-1", label: "Ada" },
      },
      {
        type: "insert-text",
        blockId: "paragraph-1",
        offset: 7,
        text: " world",
      },
    ]);

    const xml = await xmlExporter.export(editor);

    expect(xml).toContain("<segments>");
    expect(xml).toContain("<text>Hello </text>");
    expect(xml).toContain('<node type="mention" props="{&quot;id&quot;:&quot;user-1&quot;,&quot;label&quot;:&quot;Ada&quot;}" />');
    expect(xml).toContain("<text> world</text>");

    editor.destroy();
  });

  it("exports table content using stable synthetic row and cell ids", async () => {
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
        text: "A1",
      } as InsertTableCellTextOp,
    ]);

    const xml = await xmlExporter.export(editor);

    expect(xml).toContain('<block id="table-1" type="table">');
    expect(xml).toContain('<block id="row-0" type="__table_row">');
    expect(xml).toContain('<block id="cell-0-0" type="__table_cell">');
    expect(xml).toContain("<content>A1</content>");

    editor.destroy();
  });

  it("exports database payload as deterministic JSON within XML", async () => {
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
        values: { name: "Ship XML" },
      } as DatabaseInsertRowOp,
    ]);

    const xml = await xmlExporter.export(editor);

    expect(xml).toContain('<block id="db-1" type="database">');
    expect(xml).toContain("<database>");
    expect(xml).toContain("&quot;title&quot;:&quot;Roadmap&quot;");
    expect(xml).toContain("&quot;id&quot;:&quot;row-1&quot;");

    editor.destroy();
  });
});
