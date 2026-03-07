import { describe, it, expect } from "vitest";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { astToBlocks } from "../astToBlocks.js";
import { blocksToOps } from "@pen/core";
import type { MdastRoot } from "../types.js";
import type { SchemaRegistry } from "@pen/core";

function parse(md: string) {
  return fromMarkdown(md, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

const stubRegistry: SchemaRegistry = {
  resolve: () => null,
  resolveInline: () => null,
  resolveApp: () => null,
  resolveLayout: () => null,
  allBlocks: () => [],
  allInlines: () => [],
  allApps: () => [],
  allBlockDisplays: () => [],
};

function convert(md: string) {
  const tree = parse(md);
  return astToBlocks(tree as MdastRoot, stubRegistry);
}

describe("@pen/import-markdown", () => {
  it("heading + paragraph (AC 16)", () => {
    const blocks = convert("# Hello\n\nWorld");

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("heading");
    expect(blocks[0].props.level).toBe(1);
    expect(blocks[0].content).toBe("Hello");
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[1].content).toBe("World");
  });

  it("bullet list items with nesting (AC 17)", () => {
    const blocks = convert("- item 1\n- item 2\n  - nested");

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      type: "bulletListItem",
      content: "item 1",
      props: { indent: 0 },
    });
    expect(blocks[1]).toMatchObject({
      type: "bulletListItem",
      content: "item 2",
      props: { indent: 0 },
    });
    expect(blocks[2]).toMatchObject({
      type: "bulletListItem",
      content: "nested",
      props: { indent: 1 },
    });
  });

  it("bold and italic marks (AC 18)", () => {
    const blocks = convert("**bold** and *italic*");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[0].content).toBe("bold and italic");

    const marks = blocks[0].marks!;
    const boldMark = marks.find((m) => m.type === "bold");
    const italicMark = marks.find((m) => m.type === "italic");

    expect(boldMark).toBeDefined();
    expect(boldMark!.start).toBe(0);
    expect(boldMark!.end).toBe(4);

    expect(italicMark).toBeDefined();
    expect(italicMark!.start).toBe(9);
    expect(italicMark!.end).toBe(15);
  });

  it("link mark with href (AC 19)", () => {
    const blocks = convert("[link](https://example.com)");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("link");

    const linkMark = blocks[0].marks!.find((m) => m.type === "link");
    expect(linkMark).toBeDefined();
    expect(linkMark!.props!.href).toBe("https://example.com");
    expect(linkMark!.start).toBe(0);
    expect(linkMark!.end).toBe(4);
  });

  it("inline code mark (AC 20)", () => {
    const blocks = convert("`code`");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("code");

    const codeMark = blocks[0].marks!.find((m) => m.type === "code");
    expect(codeMark).toBeDefined();
    expect(codeMark!.start).toBe(0);
    expect(codeMark!.end).toBe(4);
  });

  it("strikethrough mark via GFM (AC 21)", () => {
    const blocks = convert("~~strike~~");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("strike");

    const strikeMark = blocks[0].marks!.find(
      (m) => m.type === "strikethrough",
    );
    expect(strikeMark).toBeDefined();
    expect(strikeMark!.start).toBe(0);
    expect(strikeMark!.end).toBe(6);
  });

  it("check list items (AC 22)", () => {
    const blocks = convert("- [ ] unchecked\n- [x] checked");

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "checkListItem",
      content: "unchecked",
      props: { indent: 0, checked: false },
    });
    expect(blocks[1]).toMatchObject({
      type: "checkListItem",
      content: "checked",
      props: { indent: 0, checked: true },
    });
  });

  it("fenced code block with language (AC 23)", () => {
    const blocks = convert("```javascript\nconst x = 1;\n```");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("codeBlock");
    expect(blocks[0].props.language).toBe("javascript");
    expect(blocks[0].content).toBe("const x = 1;");
  });

  it("thematic break → divider (AC 24)", () => {
    const blocks = convert("---");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("divider");
  });

  it("image block with src and alt (AC 25)", () => {
    const blocks = convert('![alt text](https://example.com/img.png "title")');

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("image");
    expect(blocks[0].props.src).toBe("https://example.com/img.png");
    expect(blocks[0].props.alt).toBe("alt text");
    expect(blocks[0].props.caption).toBe("title");
  });

  it("GFM table with header (AC 26)", () => {
    const blocks = convert("| A | B |\n|---|---|\n| 1 | 2 |");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");
    expect(blocks[0].props.hasHeaderRow).toBe(true);
    expect(blocks[0].children).toHaveLength(2);
    expect(blocks[0].children![0].type).toBe("__table_row");
    expect(blocks[0].children![0].children).toHaveLength(2);
  });

  it("numbered list items", () => {
    const blocks = convert("1. first\n2. second\n3. third");

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      type: "numberedListItem",
      content: "first",
      props: { indent: 0 },
    });
    expect(blocks[1]).toMatchObject({
      type: "numberedListItem",
      content: "second",
      props: { indent: 0 },
    });
  });

  it("blockquote", () => {
    const blocks = convert("> quoted text");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("blockquote");
    expect(blocks[0].content).toBe("quoted text");
  });

  it("heading levels 1-6", () => {
    const blocks = convert("# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6");

    expect(blocks).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(blocks[i].type).toBe("heading");
      expect(blocks[i].props.level).toBe(i + 1);
    }
  });

  it("overlapping marks", () => {
    const blocks = convert("**bold and *both***");

    expect(blocks).toHaveLength(1);
    const marks = blocks[0].marks!;
    expect(marks.some((m) => m.type === "bold")).toBe(true);
    expect(marks.some((m) => m.type === "italic")).toBe(true);
  });

  it("blocksToOps generates correct ops", () => {
    const blocks = convert("# Title\n\nHello **world**");
    const ops = blocksToOps(blocks);

    const insertBlocks = ops.filter((o) => o.type === "insert-block");
    expect(insertBlocks).toHaveLength(2);
    expect(insertBlocks[0].blockType).toBe("heading");
    expect(insertBlocks[1].blockType).toBe("paragraph");

    const insertTexts = ops.filter((o) => o.type === "insert-text");
    expect(insertTexts).toHaveLength(2);

    const formatTexts = ops.filter((o) => o.type === "format-text");
    expect(formatTexts.length).toBeGreaterThan(0);
    expect(formatTexts[0].marks).toHaveProperty("bold");
  });

  it("all blocks in single undo group (AC 27)", () => {
    const blocks = convert("# Title\n\nParagraph\n\n- item");
    const ops = blocksToOps(blocks);

    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((o) => o.type === "insert-block" || o.type === "insert-text" || o.type === "format-text")).toBe(true);
  });
});
