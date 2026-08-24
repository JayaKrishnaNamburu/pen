import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { markdownExporter } from "../exporter";

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

describe("EM8 markdown export", () => {
  it("EM8: empty paragraph and empty table cell export as empty; keep\\u200Bme is preserved", () => {
    const editor = createBareEditor();
    seedEm8Fixture(editor);

    const markdown = markdownExporter.export(editor);
    // the exporter's return type admits a promise; this fixture is synchronous,
    // and narrowing here keeps the string assertions below honest.
    if (typeof markdown !== "string") {
      throw new Error("expected a synchronous markdown export");
    }

    expect(markdown.startsWith(`\n\n${KEEP}`)).toBe(true);
    expect(markdown).toContain(KEEP);
    expect(markdown).toContain(CELL_CONTROL);
    expect(markdown).toContain(`|  | ${CELL_CONTROL} |`);
    expect(markdown.split("\n").some((line) => line === "\u200B")).toBe(false);
    expect(markdown).not.toMatch(/\|\s*\u200B\s*\|/);

    editor.destroy();
  });
});
