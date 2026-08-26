import type { BlockHandle, Editor, SchemaRegistry } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { exportMarkdownForBlocks } from "../markdownSerialization";

describe("IOP3 markdown serialization dialect", () => {
  it("IOP3 table with a header row is a GFM pipe table", () => {
    const handle = createTableHandle({
      hasHeaderRow: true,
      rows: [
        ["A", "B"],
        ["1", "2"],
      ],
    });

    expect(exportMarkdown(handle)).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  it("IOP3 pipe characters in GFM table cells are escaped", () => {
    const handle = createTableHandle({
      hasHeaderRow: true,
      rows: [["A|B"]],
    });

    expect(exportMarkdown(handle)).toBe("| A\\|B |\n| --- |");
  });

  it("IOP3 table without a header row falls back to HTML", () => {
    const handle = createTableHandle({
      hasHeaderRow: false,
      rows: [
        ["A", "B<C"],
        ["1", "2"],
      ],
    });

    expect(exportMarkdown(handle)).toBe(
      "<table><tbody><tr><td>A</td><td>B&lt;C</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>",
    );
  });

  it("IOP3 omits non-string inserts (mention, inlineApp)", () => {
    const handle = createTextHandle("p1", "paragraph", [
      { insert: "Hi " },
      { insert: { mention: { id: "user-1", label: "Ada" } } },
      { insert: "and " },
      { insert: { inlineApp: { appType: "timer" } } },
      { insert: "there" },
    ]);

    const markdown = exportMarkdownForBlocks(
      createExportEditor([handle], {
        blocks: { paragraph: (block) => block.content ?? "" },
        inlines: {
          mention: () => "@Ada",
          inlineApp: () => "[app:timer]",
        },
      }),
      [handle],
    );

    expect(markdown).toBe("Hi and there");
    expect(markdown).not.toContain("@Ada");
    expect(markdown).not.toContain("[app:timer]");
  });

  it("IOP3 skips marks that have no toMarkdown", () => {
    const handle = createTextHandle("p1", "paragraph", [
      {
        insert: "Hello",
        attributes: { bold: true, textColor: { color: "red" } },
      },
    ]);

    const markdown = exportMarkdownForBlocks(
      createExportEditor([handle], {
        blocks: { paragraph: (block) => block.content ?? "" },
        inlines: { bold: (text) => `**${text}**` },
      }),
      [handle],
    );

    expect(markdown).toBe("**Hello**");
    expect(markdown).not.toContain("color");
    expect(markdown).not.toContain("<span");
  });

  it("IOP3 falls back to plain text when a block has no toMarkdown", () => {
    const handle = createTextHandle("w1", "widget", [{ insert: "Hello" }]);

    expect(
      exportMarkdownForBlocks(createExportEditor([handle], {}), [handle]),
    ).toBe("Hello");
  });

  it("IOP3 joins consecutive list items with a single newline", () => {
    const items = [
      createTextHandle("l1", "bulletListItem", [{ insert: "one" }]),
      createTextHandle("l2", "bulletListItem", [{ insert: "two" }]),
      createTextHandle("l3", "checkListItem", [{ insert: "todo" }]),
    ];

    const markdown = exportMarkdownForBlocks(
      createExportEditor(items, {
        blocks: {
          bulletListItem: (block) => `- ${block.content ?? ""}`,
          checkListItem: (block) => `- [ ] ${block.content ?? ""}`,
        },
      }),
      items,
    );

    expect(markdown).toBe("- one\n- two\n- [ ] todo");
  });

  it("IOP3 injects numbered-list start from sibling walk into the serializer", () => {
    const first = createNumberedListHandle("n1", null, { start: 3 }, "one");
    const second = createNumberedListHandle("n2", first, {}, "two");
    const items = [first, second];

    const starts: unknown[] = [];
    const markdown = exportMarkdownForBlocks(
      createExportEditor(items, {
        blocks: {
          numberedListItem: (block) => {
            starts.push(block.props.start);
            return `${String(block.props.start)}. ${block.content ?? ""}`;
          },
        },
      }),
      items,
    );

    expect(starts).toEqual([3, 4]);
    expect(markdown).toBe("3. one\n4. two");
  });
});

function exportMarkdown(handle: BlockHandle): string {
  return exportMarkdownForBlocks(
    createExportEditor([handle], {
      blocks: { table: () => "" },
    }),
    [handle],
  );
}

function createTextHandle(
  id: string,
  type: string,
  deltas: Array<{ insert: unknown; attributes?: Record<string, unknown> }>,
): BlockHandle {
  const storedText = deltas
    .map((delta) => (typeof delta.insert === "string" ? delta.insert : ""))
    .join("");
  const handle = {
    id,
    type,
    props: {},
    textDeltas: () => deltas,
    textContent: () => storedText,
    as(capability: string) {
      return capability === "table" && handle.type === "table" ? handle : null;
    },
  };
  return handle as unknown as BlockHandle;
}

function createNumberedListHandle(
  id: string,
  prev: BlockHandle | null,
  props: Record<string, unknown>,
  text: string,
): BlockHandle {
  const handle = {
    id,
    type: "numberedListItem",
    props,
    prev,
    textDeltas: () => [{ insert: text }],
    textContent: () => text,
    as(capability: string) {
      return capability === "table" && handle.type === "table" ? handle : null;
    },
  };
  return handle as unknown as BlockHandle;
}

function createTableHandle(options: {
  hasHeaderRow: boolean;
  rows: string[][];
}): BlockHandle {
  const { hasHeaderRow, rows } = options;
  const colCount = Math.max(...rows.map((row) => row.length), 0);
  const handle = {
    id: "t1",
    type: "table",
    props: { hasHeaderRow },
    textContent: () => "",
    tableRowCount: () => rows.length,
    tableColumnCount: () => colCount,
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
  serializers: {
    blocks?: Record<
      string,
      (block: {
        content?: string;
        props: Record<string, unknown>;
      }) => string
    >;
    inlines?: Record<
      string,
      (text: string, props: Record<string, unknown>) => string
    >;
  },
): Editor {
  const schema = {
    resolve(type: string) {
      const toMarkdown = serializers.blocks?.[type];
      if (!toMarkdown) {
        return null;
      }
      return { serialize: { toMarkdown } };
    },
    resolveInline(type: string) {
      const toMarkdown = serializers.inlines?.[type];
      if (!toMarkdown) {
        return null;
      }
      return { serialize: { toMarkdown } };
    },
  } as unknown as SchemaRegistry;

  return {
    schema,
    blocks: () => handles,
  } as unknown as Editor;
}
