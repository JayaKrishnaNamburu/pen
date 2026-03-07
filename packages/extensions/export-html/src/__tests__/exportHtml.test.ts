import { describe, it, expect } from "vitest";
import { createEditor } from "@pen/core";
import { htmlExporter } from "../exporter.js";

function editorWithBlocks(ops: Parameters<ReturnType<typeof createEditor>["apply"]>[0]) {
  const editor = createEditor({
    without: ["document-ops", "delta-stream", "undo"],
  });
  editor.apply(ops);
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
});
