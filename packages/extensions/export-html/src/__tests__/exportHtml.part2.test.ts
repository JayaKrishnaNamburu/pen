import { describe, it, expect } from "vitest";
import { createEditor } from "@input/pen-core";
import type { DocumentOp } from "@input/pen-types";
import { htmlExporter } from "../exporter";

type InsertTableCellTextOp = Extract<DocumentOp, { type: "insert-table-cell-text" }>;
type FormatTableCellTextOp = Extract<DocumentOp, { type: "format-table-cell-text" }>;

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

describe("@input/pen-export-html", () => {
  it("supports resolved suggestion export inside table cells", () => {
    const editor = editorWithTable(
      {
        type: "insert-block",
        blockId: "t3",
        blockType: "table",
        props: { hasHeaderRow: false },
        position: "last",
      },
      [
        {
          type: "insert-table-cell-text",
          blockId: "t3",
          row: 0,
          col: 0,
          offset: 0,
          text: "ab",
        } as InsertTableCellTextOp,
        {
          type: "format-table-cell-text",
          blockId: "t3",
          row: 0,
          col: 0,
          offset: 0,
          length: 1,
          marks: {
            suggestion: { id: "cell-insert", action: "insert" },
          },
        } as FormatTableCellTextOp,
        {
          type: "format-table-cell-text",
          blockId: "t3",
          row: 0,
          col: 0,
          offset: 1,
          length: 1,
          marks: {
            suggestion: { id: "cell-delete", action: "delete" },
          },
        } as FormatTableCellTextOp,
      ],
    );

    const rawHtml = htmlExporter.export(editor);
    expect(rawHtml).toContain('<ins data-suggestion-id="cell-insert">a</ins>');
    expect(rawHtml).toContain('<del data-suggestion-id="cell-delete">b</del>');

    const resolvedHtml = htmlExporter.export(editor, {
      includeSuggestions: false,
    });
    expect(resolvedHtml).toContain("<td>a</td>");
    expect(resolvedHtml).not.toContain("<ins");
    expect(resolvedHtml).not.toContain("<del");
    expect(resolvedHtml).not.toContain(">b<");

    editor.destroy();
  });

  it("preserves seeded structured and hidden blocks when exporting flow documents", () => {
    const editor = createFlowEditorFromSeededDocument((seedEditor) => {
      seedEditor.apply([
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
          text: "Alice",
        } as InsertTableCellTextOp,
        {
          type: "insert-block",
          blockId: "sub-1",
          blockType: "subdocument",
          props: { subdocumentGuid: "nested-guid" },
          position: "last",
        },
      ]);
    });

    const html = htmlExporter.export(editor);

    expect(editor.documentProfile).toBe("flow");
    expect(html).toContain("<table>");
    expect(html).toContain(">Alice</th>");
    expect(html).toContain('data-pen-subdocument="');

    editor.destroy();
  });
});
