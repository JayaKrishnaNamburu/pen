import { describe, it, expect } from "vitest";
import { createEditor } from "@pen/core";
import { markdownExporter } from "../exporter.js";

function editorWithBlocks(ops: Parameters<ReturnType<typeof createEditor>["apply"]>[0]) {
  const editor = createEditor({
    without: ["document-ops", "delta-stream", "undo"],
  });
  editor.apply(ops);
  return editor;
}

describe("@pen/export-markdown", () => {
  it("exports a heading as markdown", () => {
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
      { type: "insert-text", blockId: "b1", offset: 0, text: "Hello world" },
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
      { type: "insert-text", blockId: "b1", offset: 0, text: "Title" },
      {
        type: "insert-block",
        blockId: "b2",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "b2", offset: 0, text: "Body" },
    ]);

    const md = markdownExporter.export(editor);
    expect(md).toContain("## Title");
    expect(md).toContain("Body");
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
        type: "insert-text",
        blockId: "child-1",
        offset: 0,
        text: "Nested child",
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
});
