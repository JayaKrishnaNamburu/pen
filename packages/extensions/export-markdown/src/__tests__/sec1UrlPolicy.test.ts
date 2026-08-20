import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { markdownExporter } from "../exporter";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

function createBareEditor() {
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
  return editor;
}

describe("SEC1 markdown URL policy", () => {
  it("SEC1: javascript: link mark becomes a non-navigating markdown form", () => {
    const editor = createBareEditor();
    editor.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "b1", offset: 0, text: "Hello" },
      {
        type: "format-text",
        blockId: "b1",
        offset: 0,
        length: 5,
        marks: { link: { href: "javascript:alert(1)" } },
      },
    ]);

    const markdown = markdownExporter.export(editor);
    expect(markdown).toBe("Hello");
    expect(markdown).not.toContain("javascript:");

    editor.destroy();
  });

  it("SEC1: javascript: image src is omitted", () => {
    const editor = createBareEditor();
    editor.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "image",
        props: { src: "javascript:alert(1)", alt: "Alt" },
        position: "last",
      },
    ]);

    const markdown = markdownExporter.export(editor);
    expect(markdown).not.toContain("javascript:");
    expect(markdown).not.toContain("](");

    editor.destroy();
  });

  it("SEC1: allowed https href still exports as a markdown link", () => {
    const editor = createBareEditor();
    editor.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      { type: "insert-text", blockId: "b1", offset: 0, text: "Hello" },
      {
        type: "format-text",
        blockId: "b1",
        offset: 0,
        length: 5,
        marks: { link: { href: "https://example.com", title: "Example" } },
      },
    ]);

    const markdown = markdownExporter.export(editor);
    expect(markdown).toContain('[Hello](https://example.com "Example")');

    editor.destroy();
  });
});
