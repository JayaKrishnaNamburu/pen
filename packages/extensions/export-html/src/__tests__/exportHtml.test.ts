import { describe, it, expect } from "vitest";
import { createEditor } from "@pen/core";
import type { DocumentOp } from "@pen/types";
import { htmlExporter } from "../exporter";

type InsertTableCellTextOp = Extract<DocumentOp, { type: "insert-table-cell-text" }>;
type FormatTableCellTextOp = Extract<DocumentOp, { type: "format-table-cell-text" }>;
type UpdateTableColumnsOp = Extract<DocumentOp, { type: "update-table-columns" }>;
type DatabaseInsertRowOp = Extract<DocumentOp, { type: "database-insert-row" }>;

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

describe("@pen/export-html", () => {
  it("exports a heading as HTML", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "heading",
        props: { level: 1 },
        position: "last",
      },
      { type: "insert-text", blockId: "b1", offset: 0, text: "Hello" },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("<h1>");
    expect(html).toContain("Hello");
    expect(html).toContain("</h1>");
    editor.destroy();
  });

  it("exports a paragraph as <p>", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "b1", offset: 0, text: "Hello world" },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("<p>");
    expect(html).toContain("Hello world");
    expect(html).toContain("</p>");
    editor.destroy();
  });

  it("escapes HTML entities in text", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "b1",
        offset: 0,
        text: '<script>alert("xss")</script>',
      },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    editor.destroy();
  });

  it("exports bold inline marks", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "b1",
        offset: 0,
        text: "hello world",
      },
      {
        type: "format-text",
        blockId: "b1",
        offset: 0,
        length: 5,
        marks: { bold: true },
      },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("<strong>hello</strong>");
    expect(html).toContain(" world");
    editor.destroy();
  });

  it("supports raw and resolved suggestion export for inline content", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "b1",
        offset: 0,
        text: "ab",
      },
      {
        type: "format-text",
        blockId: "b1",
        offset: 0,
        length: 1,
        marks: {
          suggestion: { id: "s-insert", action: "insert" },
        },
      },
      {
        type: "format-text",
        blockId: "b1",
        offset: 1,
        length: 1,
        marks: {
          suggestion: { id: "s-delete", action: "delete" },
        },
      },
    ]);

    const rawHtml = htmlExporter.export(editor);
    expect(rawHtml).toContain('<ins data-suggestion-id="s-insert">a</ins>');
    expect(rawHtml).toContain('<del data-suggestion-id="s-delete">b</del>');

    const resolvedHtml = htmlExporter.export(editor, {
      includeSuggestions: false,
    });
    expect(resolvedHtml).toContain("<p>a</p>");
    expect(resolvedHtml).not.toContain("<ins");
    expect(resolvedHtml).not.toContain("<del");
    expect(resolvedHtml).not.toContain(">b<");

    editor.destroy();
  });

  it("wraps list items in list containers", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "l1",
        blockType: "bulletListItem",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "l1", offset: 0, text: "First" },
      {
        type: "insert-block",
        blockId: "l2",
        blockType: "bulletListItem",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "l2", offset: 0, text: "Second" },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>First</li>");
    expect(html).toContain("<li>Second</li>");
    editor.destroy();
  });

  it("exports nested layout children via documentState.allBlocks()", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "toggle-1",
        blockType: "toggle",
        props: {},
        position: "last",
      },
      {
        type: "insert-block",
        blockId: "child-1",
        blockType: "paragraph",
        props: {},
        position: { parent: "toggle-1", index: 0 },
      },
      {
        type: "insert-text",
        blockId: "child-1",
        offset: 0,
        text: "Nested child",
      },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("Nested child");
    editor.destroy();
  });

  it("has correct metadata", () => {
    expect(htmlExporter.name).toBe("html");
    expect(htmlExporter.mimeType).toBe("text/html");
    expect(htmlExporter.fileExtension).toBe(".html");
  });

  it("exports a table block as HTML table", () => {
    const editor = editorWithTable(
      {
        type: "insert-block",
        blockId: "t1",
        blockType: "table",
        props: { hasHeaderRow: true },
        position: "last",
      },
      [
        {
          type: "insert-table-cell-text",
          blockId: "t1",
          row: 0,
          col: 0,
          offset: 0,
          text: "Name",
        } as InsertTableCellTextOp,
        {
          type: "insert-table-cell-text",
          blockId: "t1",
          row: 0,
          col: 1,
          offset: 0,
          text: "Age",
        } as InsertTableCellTextOp,
        {
          type: "insert-table-cell-text",
          blockId: "t1",
          row: 1,
          col: 0,
          offset: 0,
          text: "Alice",
        } as InsertTableCellTextOp,
        {
          type: "insert-table-cell-text",
          blockId: "t1",
          row: 1,
          col: 1,
          offset: 0,
          text: "30",
        } as InsertTableCellTextOp,
      ],
    );

    const html = htmlExporter.export(editor);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<th>Age</th>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td>Alice</td>");
    expect(html).toContain("<td>30</td>");
    expect(html).toContain("</table>");
    editor.destroy();
  });

  it("exports a table without header row (no thead)", () => {
    const editor = editorWithTable(
      {
        type: "insert-block",
        blockId: "t1",
        blockType: "table",
        props: { hasHeaderRow: false },
        position: "last",
      },
      [
        {
          type: "insert-table-cell-text",
          blockId: "t1",
          row: 0,
          col: 0,
          offset: 0,
          text: "A",
        } as InsertTableCellTextOp,
        {
          type: "insert-table-cell-text",
          blockId: "t1",
          row: 1,
          col: 0,
          offset: 0,
          text: "B",
        } as InsertTableCellTextOp,
      ],
    );

    const html = htmlExporter.export(editor);
    expect(html).not.toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td>A</td>");
    expect(html).toContain("<td>B</td>");
    editor.destroy();
  });

  it("escapes HTML entities in table cells", () => {
    const editor = editorWithTable(
      {
        type: "insert-block",
        blockId: "t1",
        blockType: "table",
        props: { hasHeaderRow: false },
        position: "last",
      },
      [
        {
          type: "insert-table-cell-text",
          blockId: "t1",
          row: 0,
          col: 0,
          offset: 0,
          text: "<script>",
        } as InsertTableCellTextOp,
      ],
    );

    const html = htmlExporter.export(editor);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    editor.destroy();
  });

  it("preserves inline formatting inside table cells", () => {
    const editor = editorWithTable(
      {
        type: "insert-block",
        blockId: "t2",
        blockType: "table",
        props: { hasHeaderRow: false },
        position: "last",
      },
      [
        {
          type: "insert-table-cell-text",
          blockId: "t2",
          row: 0,
          col: 0,
          offset: 0,
          text: "Alpha",
        } as InsertTableCellTextOp,
        {
          type: "format-table-cell-text",
          blockId: "t2",
          row: 0,
          col: 0,
          offset: 0,
          length: 5,
          marks: { bold: true },
        } as FormatTableCellTextOp,
      ],
    );

    const html = htmlExporter.export(editor);
    expect(html).toContain("<strong>Alpha</strong>");
    editor.destroy();
  });

});
