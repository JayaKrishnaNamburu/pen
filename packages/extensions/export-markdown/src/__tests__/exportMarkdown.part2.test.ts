import { describe, it, expect } from "vitest";
import {
  blocksToOps,
  createEditor,
  type PendingBlock,
} from "@pen/core";
import type { DocumentOp } from "@pen/types";
import { markdownExporter } from "../exporter";

type InsertTableCellTextOp = Extract<DocumentOp, { type: "insert-table-cell-text" }>;
type FormatTableCellTextOp = Extract<DocumentOp, { type: "format-table-cell-text" }>;
type UpdateTableColumnsOp = Extract<DocumentOp, { type: "update-table-columns" }>;
type DatabaseInsertRowOp = Extract<DocumentOp, { type: "database-insert-row" }>;
type InsertBlockOp = Extract<DocumentOp, { type: "insert-block" }>;

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

function editorWithBlocks(ops: Parameters<ReturnType<typeof createEditor>["apply"]>[0]) {
  const editor = createEditor({
    preset: noDefaultExtensionsPreset,
  });
  editor.apply(ops);
  return editor;
}

function editorWithTable(
  insertOp: Parameters<ReturnType<typeof createEditor>["apply"]>[0][0],
  cellOps: Parameters<ReturnType<typeof createEditor>["apply"]>[0],
) {
  const editor = createEditor({
    preset: noDefaultExtensionsPreset,
  });
  editor.apply([insertOp]);
  if (cellOps.length > 0) {
    editor.apply(cellOps);
  }
  return editor;
}

function createFlowEditorFromSeededDocument(
  seed: (editor: ReturnType<typeof createEditor>) => void,
) {
  const seedEditor = createEditor({
    preset: noDefaultExtensionsPreset,
  });
  seed(seedEditor);

  const document = seedEditor.internals.crdtDoc;
  seedEditor.internals.adapter.setDocumentProfile?.(document, "flow");

  const editor = createEditor({
    document,
    preset: noDefaultExtensionsPreset,
  });
  seedEditor.destroy();
  return editor;
}

describe("table markdown round-trip", () => {
  it("import → editor → export produces equivalent markdown", () => {
    const inputBlocks: PendingBlock[] = [
      {
        type: "table",
        props: { hasHeaderRow: true, hasHeaderColumn: false },
        children: [
          {
            type: "__table_row",
            props: { _rowIndex: 0 },
            children: [
              { type: "__table_cell", props: {}, content: "Name" },
              { type: "__table_cell", props: {}, content: "Value" },
            ],
          },
          {
            type: "__table_row",
            props: { _rowIndex: 1 },
            children: [
              { type: "__table_cell", props: {}, content: "foo" },
              { type: "__table_cell", props: {}, content: "42" },
            ],
          },
        ],
      },
    ];

    const ops = blocksToOps(inputBlocks);
    const editor = createEditor({
      preset: noDefaultExtensionsPreset,
    });
    editor.apply(ops);

    const tableBlockId = (ops[0] as InsertBlockOp).blockId;
    const cell00 = editor.getBlock(tableBlockId)?.tableCell(0, 0);
    const cell01 = editor.getBlock(tableBlockId)?.tableCell(0, 1);
    const cell10 = editor.getBlock(tableBlockId)?.tableCell(1, 0);
    const cell11 = editor.getBlock(tableBlockId)?.tableCell(1, 1);
    expect(cell00?.textContent()).toBe("Name");
    expect(cell01?.textContent()).toBe("Value");
    expect(cell10?.textContent()).toBe("foo");
    expect(cell11?.textContent()).toBe("42");

    const md = markdownExporter.export(editor);
    expect(md).toContain("| Name | Value |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| foo | 42 |");

    editor.destroy();
  });

  it("round-trips a 2-column table through import and export", () => {
    const inputBlocks: PendingBlock[] = [
      {
        type: "table",
        props: { hasHeaderRow: true, hasHeaderColumn: false },
        children: [
          {
            type: "__table_row",
            props: { _rowIndex: 0 },
            children: [
              { type: "__table_cell", props: {}, content: "X" },
              { type: "__table_cell", props: {}, content: "Y" },
            ],
          },
          {
            type: "__table_row",
            props: { _rowIndex: 1 },
            children: [
              { type: "__table_cell", props: {}, content: "10" },
              { type: "__table_cell", props: {}, content: "20" },
            ],
          },
        ],
      },
    ];

    const ops = blocksToOps(inputBlocks);
    const editor = createEditor({
      preset: noDefaultExtensionsPreset,
    });
    editor.apply(ops);

    const block = editor.getBlock((ops[0] as InsertBlockOp).blockId);
    expect(block?.tableRowCount()).toBe(2);
    expect(block?.tableColumnCount()).toBe(2);

    const md = markdownExporter.export(editor);
    expect(md).toContain("| X | Y |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 10 | 20 |");

    editor.destroy();
  });
});
