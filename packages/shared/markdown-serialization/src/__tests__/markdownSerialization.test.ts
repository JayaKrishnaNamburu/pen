import type { BlockHandle, Editor, SchemaRegistry } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { exportMarkdownForBlocks } from "../markdownSerialization";
import { getNumberedListItemValue } from "../orderedList";

const STORAGE_SENTINEL = "\u200B";

describe("@input/pen-markdown-serialization", () => {
  it("derives numbered list values from prior siblings at the same indent", () => {
    const firstItem = createNumberedListBlock("b1", null, { start: 3 });
    const secondItem = createNumberedListBlock("b2", firstItem);
    const nestedItem = createNumberedListBlock("b3", secondItem, { indent: 1 });
    const thirdItem = createNumberedListBlock("b4", nestedItem);

    expect(getNumberedListItemValue(firstItem)).toBe(3);
    expect(getNumberedListItemValue(secondItem)).toBe(4);
    expect(getNumberedListItemValue(nestedItem)).toBe(1);
    expect(getNumberedListItemValue(thirdItem)).toBe(5);
  });

  it("I11: empty block serializes to empty markdown text, not a ZWSP", () => {
    const handle = createTextBlock("b1", "paragraph", STORAGE_SENTINEL);
    const markdown = exportMarkdownForBlocks(
      createExportEditor([handle], {
        paragraph: (block) => block.content ?? "",
      }),
      [handle],
    );

    expect(markdown).toBe("");
    expect(markdown).not.toContain(STORAGE_SENTINEL);
  });

  it("I11: empty table cell serializes to empty markdown text, not a ZWSP", () => {
    const handle = createEmptyTableHandle();
    const markdown = exportMarkdownForBlocks(
      createExportEditor([handle], {
        table: () => "",
      }),
      [handle],
    );

    expect(markdown).not.toContain(STORAGE_SENTINEL);
    expect(markdown).toBe("|  |\n| --- |");
  });
});

function createNumberedListBlock(
  id: string,
  prev: BlockHandle | null,
  props: Record<string, unknown> = {},
) : BlockHandle {
  return {
    id,
    type: "numberedListItem",
    props,
    prev,
  } as unknown as BlockHandle;
}

function createTextBlock(
  id: string,
  type: string,
  storedText: string,
): BlockHandle {
  return {
    id,
    type,
    props: {},
    textDeltas: () => [{ insert: storedText }],
    textContent: () => storedText,
    tableRowCount: () => 0,
  } as unknown as BlockHandle;
}

function createEmptyTableHandle(): BlockHandle {
  return {
    id: "t1",
    type: "table",
    props: { hasHeaderRow: true },
    textContent: () => "",
    tableRowCount: () => 1,
    tableColumnCount: () => 1,
    tableCell: () => ({
      textDeltas: () => [{ insert: STORAGE_SENTINEL }],
      textContent: () => STORAGE_SENTINEL,
    }),
  } as unknown as BlockHandle;
}

function createExportEditor(
  handles: BlockHandle[],
  markdownSerializers: Record<
    string,
    (block: { content?: string }) => string
  > = {},
): Editor {
  const schema = {
    resolve(type: string) {
      const toMarkdown = markdownSerializers[type];
      if (!toMarkdown) {
        return null;
      }
      return {
        serialize: { toMarkdown },
      };
    },
    resolveInline() {
      return null;
    },
  } as unknown as SchemaRegistry;

  return {
    schema,
    blocks: () => handles,
  } as unknown as Editor;
}
