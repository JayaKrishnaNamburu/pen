import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { DocumentOp } from "@input/pen-types";
import { htmlExporter } from "../exporter";
import { defaultSchema } from "@input/pen-schema-default";

type FormatTableCellTextOp = Extract<DocumentOp, { type: "format-table-cell-text" }>;
type InsertTableCellTextOp = Extract<DocumentOp, { type: "insert-table-cell-text" }>;

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

describe("@input/pen-export-html SEC1 urlPolicy", () => {
  it("SEC1: javascript: link href omitted with data-pen-blocked-url", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "b1", offset: 0, text: "click" },
      {
        type: "format-text",
        blockId: "b1",
        offset: 0,
        length: 5,
        marks: { link: { href: "javascript:alert(1)" } },
      },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("<a data-pen-blocked-url=\"\">click</a>");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("javascript:");
    editor.destroy();
  });

  it("SEC1: vbscript: and mixed-case javascript: href omitted", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "b1", offset: 0, text: "ab" },
      {
        type: "format-text",
        blockId: "b1",
        offset: 0,
        length: 1,
        marks: { link: { href: "vbscript:msgbox(1)" } },
      },
      {
        type: "format-text",
        blockId: "b1",
        offset: 1,
        length: 1,
        marks: { link: { href: "JAVASCRIPT:alert(1)" } },
      },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("data-pen-blocked-url=\"\"");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("vbscript:");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("JAVASCRIPT:");
    editor.destroy();
  });

  it("SEC1: allowed https and mailto href still land", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "b1", offset: 0, text: "docs mail" },
      {
        type: "format-text",
        blockId: "b1",
        offset: 0,
        length: 4,
        marks: { link: { href: "https://example.com/docs" } },
      },
      {
        type: "format-text",
        blockId: "b1",
        offset: 5,
        length: 4,
        marks: { link: { href: "mailto:hi@example.com" } },
      },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain('<a href="https://example.com/docs">docs</a>');
    expect(html).toContain('<a href="mailto:hi@example.com">mail</a>');
    expect(html).not.toContain("data-pen-blocked-url");
    editor.destroy();
  });

  it("SEC1: javascript: / data:text/html image src omitted with data-pen-blocked-url", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "img-js",
        blockType: "image",
        props: { src: "javascript:alert(1)", alt: "hostile js" },
        position: "last",
      },
      {
        type: "insert-block",
        blockId: "img-html",
        blockType: "image",
        props: {
          src: "data:text/html,<script>alert(1)</script>",
          alt: "hostile html",
        },
        position: "last",
      },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("<img data-pen-blocked-url=\"\" alt=\"hostile js\" />");
    expect(html).toContain("<img data-pen-blocked-url=\"\" alt=\"hostile html\" />");
    expect(html).not.toContain("src=");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    editor.destroy();
  });

  it("SEC1: allowed https image src still lands", () => {
    const editor = editorWithBlocks([
      {
        type: "insert-block",
        blockId: "img-ok",
        blockType: "image",
        props: { src: "https://example.com/photo.png", alt: "photo" },
        position: "last",
      },
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain(
      '<img src="https://example.com/photo.png" alt="photo" />',
    );
    expect(html).not.toContain("data-pen-blocked-url");
    editor.destroy();
  });

  it("SEC1: javascript: href in a table cell is omitted", () => {
    const editor = createEditor({
      schema: defaultSchema, preset: noDefaultExtensionsPreset,
    });
    editor.apply([
      {
        type: "insert-block",
        blockId: "t1",
        blockType: "table",
        props: { hasHeaderRow: false },
        position: "last",
      },
    ]);
    editor.apply([
      {
        type: "insert-table-cell-text",
        blockId: "t1",
        row: 0,
        col: 0,
        offset: 0,
        text: "cell",
      } as InsertTableCellTextOp,
      {
        type: "format-table-cell-text",
        blockId: "t1",
        row: 0,
        col: 0,
        offset: 0,
        length: 4,
        marks: { link: { href: "javascript:alert(1)" } },
      } as FormatTableCellTextOp,
    ]);

    const html = htmlExporter.export(editor);
    expect(html).toContain("<a data-pen-blocked-url=\"\">cell</a>");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("javascript:");
    editor.destroy();
  });
});
