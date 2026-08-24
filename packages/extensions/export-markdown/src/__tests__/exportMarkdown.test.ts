import { describe, it, expect } from "vitest";
import {
  blocksToOps,
  createEditor,
  type PendingBlock,
} from "@input/pen-core";
import { markdownExporter } from "../exporter";
import { defaultSchema } from "@input/pen-schema-default";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

function editorWithBlocks(ops: Parameters<ReturnType<typeof createEditor>["apply"]>[0]) {
  const editor = createEditor({
    schema: defaultSchema, preset: noDefaultExtensionsPreset,
  });
  editor.apply(ops);
  return editor;
}

function editorWithTable(
  insertOp: Parameters<ReturnType<typeof createEditor>["apply"]>[0][0],
  cellOps: Parameters<ReturnType<typeof createEditor>["apply"]>[0],
) {
  const editor = createEditor({
    schema: defaultSchema, preset: noDefaultExtensionsPreset,
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
    schema: defaultSchema, preset: noDefaultExtensionsPreset,
  });
  seed(seedEditor);

  const document = seedEditor.internals.crdtDoc;
  seedEditor.internals.adapter.setDocumentProfile?.(document, "flow");

  const editor = createEditor({
    schema: defaultSchema,document,
    preset: noDefaultExtensionsPreset,
  });
  seedEditor.destroy();
  return editor;
}

describe("@input/pen-export-markdown", () => {
  it("exports a heading as markdown", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "heading",
        props: { level: 1 },
        position: "last",
      },
      { type: "splice-text", blockId: "b1", from: 0,
				to: 0,
				insert: "Hello" },
    ]);

    const md = markdownExporter.export(editor);
    expect(md).toContain("# Hello");
    editor.destroy();
  });

  it("exports a paragraph as plain text", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "splice-text", blockId: "b1", from: 0,
				to: 0,
				insert: "Hello world" },
    ]);

    const md = markdownExporter.export(editor);
    expect(md).toContain("Hello world");
    editor.destroy();
  });

  it("exports multiple blocks separated by double newlines", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "heading",
        props: { level: 2 },
        position: "last",
      },
      { type: "splice-text", blockId: "b1", from: 0,
				to: 0,
				insert: "Title" },
      {
        type: "insert-block",
        blockId: "b2",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "splice-text", blockId: "b2", from: 0,
				to: 0,
				insert: "Body" },
    ]);

    const md = markdownExporter.export(editor);
    expect(md).toContain("## Title");
    expect(md).toContain("Body");
    editor.destroy();
  });

  it("exports numbered list items with their visible sequence values", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "numberedListItem",
        props: { start: 3 },
        position: "last",
      },
      { type: "splice-text", blockId: "b1", from: 0,
				to: 0,
				insert: "Third" },
      {
        type: "insert-block",
        blockId: "b2",
        blockType: "numberedListItem",
        props: {},
        position: "last",
      },
      { type: "splice-text", blockId: "b2", from: 0,
				to: 0,
				insert: "Fourth" },
    ]);

    const md = markdownExporter.export(editor);
    expect(md).toContain("3. Third\n4. Fourth");
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
        type: "splice-text",
        blockId: "b1",
        from: 0,
				to: 0,
				insert: "hello world",
      },
      {
        type: "format-text",
        blockId: "b1",
        from: 0,
				to: 0 + 5,
        marks: { bold: true },
      },
    ]);

    const md = markdownExporter.export(editor);
    expect(md).toContain("**hello**");
    expect(md).toContain(" world");
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
        type: "splice-text",
        blockId: "child-1",
        from: 0,
				to: 0,
				insert: "Nested child",
      },
    ]);

    const md = markdownExporter.export(editor);
    expect(md).toContain("Nested child");
    editor.destroy();
  });

  it("has correct metadata", () => {
    expect(markdownExporter.name).toBe("markdown");
    expect(markdownExporter.mimeType).toBe("text/markdown");
    expect(markdownExporter.fileExtension).toBe(".md");
  });

  it("maps generic export options to resolved view mode and range export", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "splice-text", blockId: "b1", from: 0,
				to: 0,
				insert: "Keep" },
      {
        type: "splice-text",
        blockId: "b1",
        from: 4,
				to: 4,
				insert: " draft",
      },
      {
        type: "format-text",
        blockId: "b1",
        from: 4,
				to: 4 + 6,
        marks: {
          suggestion: {
            action: "delete",
          },
        },
      },
      {
        type: "insert-block",
        blockId: "b2",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "splice-text", blockId: "b2", from: 0,
				to: 0,
				insert: "Tail" },
    ]);

    const md = markdownExporter.export(editor, {
      includeSuggestions: false,
      extra: {
        range: {
          startBlockId: "b1",
          endBlockId: "b1",
        },
      },
    });

    expect(md).toBe("Keep");
    editor.destroy();
  });

  it("exports a table block as a GFM pipe table", () => {
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
          type: "splice-text",
          blockId: "t1",
          cell: { row: 0, col: 0 },
          from: 0,
          to: 0,
          insert: "Name",
        },
        {
          type: "splice-text",
          blockId: "t1",
          cell: { row: 0, col: 1 },
          from: 0,
          to: 0,
          insert: "Age",
        },
        {
          type: "splice-text",
          blockId: "t1",
          cell: { row: 1, col: 0 },
          from: 0,
          to: 0,
          insert: "Alice",
        },
        {
          type: "splice-text",
          blockId: "t1",
          cell: { row: 1, col: 1 },
          from: 0,
          to: 0,
          insert: "30",
        },
      ],
    );

    const md = markdownExporter.export(editor);
    expect(md).toContain("| Name | Age |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| Alice | 30 |");
    editor.destroy();
  });

  it("exports a table with pipe characters escaped", () => {
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
          type: "splice-text",
          blockId: "t1",
          cell: { row: 0, col: 0 },
          from: 0,
          to: 0,
          insert: "a|b",
        },
      ],
    );

    const md = markdownExporter.export(editor);
    expect(md).toContain("<table>");
    expect(md).toContain("a|b");
    expect(md).not.toContain("| --- |");
    editor.destroy();
  });

  it("preserves inline formatting inside table cells", () => {
    const editor = editorWithTable(
      {
        type: "insert-block",
        blockId: "t2",
        blockType: "table",
        props: { hasHeaderRow: true },
        position: "last",
      },
      [
        {
          type: "splice-text",
          blockId: "t2",
          cell: { row: 0, col: 0 },
          from: 0,
          to: 0,
          insert: "Name",
        },
        {
          type: "format-text",
          blockId: "t2",
          cell: { row: 0, col: 0 },
          from: 0,
          to: 4,
          marks: { bold: true },
        },
      ],
    );

    const md = markdownExporter.export(editor);
    expect(md).toContain("**Name**");
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
          type: "splice-text",
          blockId: "t1",
          cell: { row: 0, col: 0 },
          from: 0,
          to: 0,
          insert: "Alice",
        },
        {
          type: "insert-block",
          blockId: "sub-1",
          blockType: "subdocument",
          props: { subdocumentGuid: "nested-guid" },
          position: "last",
        },
      ]);
    });

    const md = markdownExporter.export(editor);

    expect(editor.documentProfile).toBe("flow");
    expect(md).toContain("| Alice |");
    expect(md).toContain("<!-- pen-subdocument:");

    editor.destroy();
  });
});
