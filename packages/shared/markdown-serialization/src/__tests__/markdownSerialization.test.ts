import type { BlockHandle, Editor, SchemaRegistry } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import {
  exportMarkdownForBlocks,
  exportMarkdownRange,
} from "../markdownSerialization";

describe("@input/pen-markdown-serialization", () => {
  it("EM1: empty block serializes to empty markdown text, not a ZWSP", () => {
    const handle = createTextBlock("b1", "paragraph", "");
    const markdown = exportMarkdownForBlocks(
      createExportEditor([handle], {
        paragraph: (block) => block.content ?? "",
      }),
      [handle],
    );

    expect(markdown).toBe("");
    expect(markdown).not.toContain("\u200B");
  });

  it("I14: user-typed zero-width space is kept in markdown", () => {
    const handle = createTextBlock("b1", "paragraph", "keep\u200Bme");
    const markdown = exportMarkdownForBlocks(
      createExportEditor([handle], {
        paragraph: (block) => block.content ?? "",
      }),
      [handle],
    );

    expect(markdown).toBe("keep\u200Bme");
  });

  it("I14: user-typed ZWSP as its own delta is not stripped", () => {
    const handle = createSegmentedTextBlock("b1", "paragraph", [
      "keep",
      "\u200B",
      "me",
    ]);
    const markdown = exportMarkdownForBlocks(
      createExportEditor([handle], {
        paragraph: (block) => block.content ?? "",
      }),
      [handle],
    );

    expect(markdown).toBe("keep\u200Bme");
  });

  it("exportMarkdownRange walks allBlocks, not only top-level blocks()", () => {
    const parent = createTextBlock("toggle-1", "toggle", "TOGGLE-TITLE");
    const child = createTextBlock(
      "toggle-child",
      "paragraph",
      "NESTED-TOGGLE-CHILD",
    );
    const markdown = exportMarkdownRange(
      createExportEditor(
        [parent],
        {
          toggle: (block) =>
            `<details><summary>${block.content ?? ""}</summary></details>`,
          paragraph: (block) => block.content ?? "",
        },
        [parent, child],
      ),
    );

    expect(markdown).toContain("TOGGLE-TITLE");
    expect(markdown).toContain("NESTED-TOGGLE-CHILD");
  });

  it("EM1: empty table cell serializes to empty markdown text, not a ZWSP", () => {
    const handle = createEmptyTableHandle();
    const markdown = exportMarkdownForBlocks(
      createExportEditor([handle], {
        table: () => "",
      }),
      [handle],
    );

    expect(markdown).not.toContain("\u200B");
    expect(markdown).toBe("|  |\n| --- |");
  });

  it("EM8: combined fixture keeps empty paragraph and empty cell empty and preserves keep\\u200Bme", () => {
    const empty = createTextBlock("empty", "paragraph", "");
    const keep = createTextBlock("keep", "paragraph", "keep\u200Bme");
    const table = createMixedTableHandle();
    const markdown = exportMarkdownForBlocks(
      createExportEditor([empty, keep, table], {
        paragraph: (block) => block.content ?? "",
        table: () => "",
      }),
      [empty, keep, table],
    );

    expect(markdown.startsWith("\n\nkeep\u200Bme")).toBe(true);
    expect(markdown).toContain("keep\u200Bme");
    expect(markdown).toContain("CELL-OK");
    expect(markdown).toContain("|  | CELL-OK |");
    expect(markdown.split("\n").some((line) => line === "\u200B")).toBe(false);
    expect(markdown).not.toMatch(/\|\s*\u200B\s*\|/);
  });
});

function createTextBlock(
  id: string,
  type: string,
  storedText: string,
): BlockHandle {
  const handle = {
    id,
    type,
    props: {},
    textDeltas: () => [{ insert: storedText }],
    textContent: () => storedText,
    as(capability: string) {
      return capability === "table" && handle.type === "table" ? handle : null;
    },
  };
  return handle as unknown as BlockHandle;
}

function createSegmentedTextBlock(
  id: string,
  type: string,
  inserts: string[],
): BlockHandle {
  const storedText = inserts.join("");
  const handle = {
    id,
    type,
    props: {},
    textDeltas: () => inserts.map((insert) => ({ insert })),
    textContent: () => storedText,
    as(capability: string) {
      return capability === "table" && handle.type === "table" ? handle : null;
    },
  };
  return handle as unknown as BlockHandle;
}

function createEmptyTableHandle(): BlockHandle {
  const handle = {
    id: "t1",
    type: "table",
    props: { hasHeaderRow: true },
    textContent: () => "",
    tableRowCount: () => 1,
    tableColumnCount: () => 1,
    tableCell: () => ({
      textDeltas: () => [{ insert: "" }],
      textContent: () => "",
    }),
    as(capability: string) {
      return capability === "table" ? handle : null;
    },
  };
  return handle as unknown as BlockHandle;
}

function createMixedTableHandle(): BlockHandle {
  const rows = [
    ["", "CELL-OK"],
    ["", ""],
  ];
  const handle = {
    id: "t-mixed",
    type: "table",
    props: { hasHeaderRow: true },
    textContent: () => "",
    tableRowCount: () => rows.length,
    tableColumnCount: () => 2,
    tableCell: (row: number, col: number) => ({
      textDeltas: () => [{ insert: rows[row]?.[col] ?? "" }],
      textContent: () => rows[row]?.[col] ?? "",
    }),
    as(capability: string) {
      return capability === "table" ? handle : null;
    },
  };
  return handle as unknown as BlockHandle;
}

function createExportEditor(
  handles: BlockHandle[],
  markdownSerializers: Record<
    string,
    (block: { content?: string }) => string
  > = {},
  allHandles: BlockHandle[] = handles,
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
    documentState: {
      allBlocks: () => allHandles,
    },
  } as unknown as Editor;
}
