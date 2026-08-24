import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { htmlExporter } from "../exporter";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

const KEEP = "keep\u200Bme";
const CELL_CONTROL = "CELL-OK";

function createBareEditor() {
  const editor = createEditor({
    schema: defaultSchema,
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

function seedEm8Fixture(editor: ReturnType<typeof createBareEditor>) {
  editor.apply([
    {
      type: "insert-block",
      blockId: "empty",
      blockType: "paragraph",
      props: {},
      position: "last",
    },
    {
      type: "insert-block",
      blockId: "keep",
      blockType: "paragraph",
      props: {},
      position: "last",
    },
    {
      type: "insert-block",
      blockId: "t1",
      blockType: "table",
      props: { hasHeaderRow: true },
      position: "last",
    },
  ]);
  editor.apply([
    {
      type: "splice-text",
      blockId: "keep",
      from: 0,
      to: 0,
      insert: KEEP,
    },
    {
      type: "splice-text",
      blockId: "t1",
      cell: { row: 0, col: 1 },
      from: 0,
      to: 0,
      insert: CELL_CONTROL,
    },
  ]);
}

describe("EM8 HTML export", () => {
  it("EM8: empty paragraph and empty table cell export as empty; keep\\u200Bme is preserved", () => {
    const editor = createBareEditor();
    seedEm8Fixture(editor);

    const html = htmlExporter.export(editor);

    expect(html).toContain(`<p>${KEEP}</p>`);
    expect(html).toContain(`<th>${CELL_CONTROL}</th>`);
    expect(html).toMatch(/<p><\/p>/);
    expect(html).toMatch(/<th><\/th>/);
    expect(html).not.toMatch(/<p>\u200B<\/p>/);
    expect(html).not.toMatch(/<(td|th)>\u200B<\/(td|th)>/);

    editor.destroy();
  });
});
