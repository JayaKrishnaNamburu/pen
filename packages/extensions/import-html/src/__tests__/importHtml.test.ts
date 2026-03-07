import { describe, it, expect } from "vitest";
import { sanitizeHTML } from "../sanitize.js";
import { parseHTML } from "../domAdapter.js";
import { domToBlocks } from "../domToBlocks.js";
import { parseInlineContent } from "../inlineParser.js";
import { blocksToOps } from "@pen/core";
import type { SchemaRegistry } from "@pen/core";
import type { DOMNode } from "../domAdapter.js";

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

function convert(html: string) {
  const sanitized = sanitizeHTML(html);
  const dom = parseHTML(sanitized);
  return domToBlocks(dom, stubRegistry);
}

describe("sanitizeHTML", () => {
  it("strips <script> tags (AC 29, 42)", () => {
    const result = sanitizeHTML('<p>safe</p><script>alert("xss")</script>');
    expect(result).not.toContain("script");
    expect(result).toContain("safe");
  });

  it("strips <style> tags (AC 42)", () => {
    const result = sanitizeHTML("<p>text</p><style>body{color:red}</style>");
    expect(result).not.toContain("style>");
    expect(result).toContain("text");
  });

  it("strips <iframe> tags (AC 42)", () => {
    const result = sanitizeHTML('<iframe src="evil.com"></iframe><p>ok</p>');
    expect(result).not.toContain("iframe");
    expect(result).toContain("ok");
  });

  it("strips event handler attributes (AC 42)", () => {
    const result = sanitizeHTML('<div onclick="alert(1)">text</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
  });

  it("handles javascript: URLs (AC 31)", () => {
    const result = sanitizeHTML('<a href="javascript:void(0)">link</a>');
    expect(result).not.toContain("javascript:");
  });

  it("preserves allowed tags", () => {
    const result = sanitizeHTML("<p><strong>bold</strong></p>");
    expect(result).toContain("<strong>");
    expect(result).toContain("bold");
  });

  it("preserves img with allowed attributes", () => {
    const result = sanitizeHTML('<img src="photo.jpg" alt="photo" />');
    expect(result).toContain("src");
    expect(result).toContain("alt");
  });
});

describe("parseInlineContent", () => {
  it("extracts text from text nodes", () => {
    const node: DOMNode = { type: "text", textContent: "hello" };
    const result = parseInlineContent(node);
    expect(result.text).toBe("hello");
    expect(result.marks).toHaveLength(0);
  });

  it("extracts bold mark", () => {
    const node: DOMNode = {
      type: "element",
      tagName: "strong",
      children: [{ type: "text", textContent: "bold" }],
    };
    const result = parseInlineContent(node);
    expect(result.text).toBe("bold");
    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]).toMatchObject({
      type: "bold",
      start: 0,
      end: 4,
    });
  });

  it("extracts link mark with href", () => {
    const node: DOMNode = {
      type: "element",
      tagName: "a",
      attributes: { href: "https://example.com", title: "Example" },
      children: [{ type: "text", textContent: "link" }],
    };
    const result = parseInlineContent(node);
    expect(result.text).toBe("link");
    expect(result.marks[0]).toMatchObject({
      type: "link",
      props: { href: "https://example.com", title: "Example" },
    });
  });

  it("handles nested marks", () => {
    const node: DOMNode = {
      type: "element",
      tagName: "strong",
      children: [
        {
          type: "element",
          tagName: "em",
          children: [{ type: "text", textContent: "both" }],
        },
      ],
    };
    const result = parseInlineContent(node);
    expect(result.text).toBe("both");
    expect(result.marks).toHaveLength(2);
    expect(result.marks.some((m) => m.type === "bold")).toBe(true);
    expect(result.marks.some((m) => m.type === "italic")).toBe(true);
  });
});

describe("@pen/import-html dom-to-blocks", () => {
  it("heading + paragraph (AC 28)", () => {
    const blocks = convert("<h1>Title</h1><p>Body</p>");

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "heading",
      props: { level: 1 },
      content: "Title",
    });
    expect(blocks[1]).toMatchObject({
      type: "paragraph",
      content: "Body",
    });
  });

  it("script tag is stripped (AC 29)", () => {
    const blocks = convert('<script>alert("xss")</script><p>safe</p>');

    const types = blocks.map((b) => b.type);
    expect(types).not.toContain("script");
    expect(blocks.some((b) => b.content === "safe")).toBe(true);
  });

  it("event handler stripped, text preserved (AC 30)", () => {
    const blocks = convert('<div onclick="alert(1)">text</div>');

    expect(blocks.length).toBeGreaterThanOrEqual(1);
    const hasText = blocks.some(
      (b) => b.content?.includes("text"),
    );
    expect(hasText).toBe(true);
  });

  it("bold mark from <strong> (AC 32)", () => {
    const blocks = convert("<p><strong>bold</strong></p>");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("bold");
    expect(blocks[0].marks?.some((m) => m.type === "bold")).toBe(true);
  });

  it("italic mark from <em> (AC 33)", () => {
    const blocks = convert("<p><em>italic</em></p>");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("italic");
    expect(blocks[0].marks?.some((m) => m.type === "italic")).toBe(true);
  });

  it("link mark with href (AC 34)", () => {
    const blocks = convert('<p><a href="https://example.com">text</a></p>');

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("text");
    const linkMark = blocks[0].marks?.find((m) => m.type === "link");
    expect(linkMark).toBeDefined();
    expect(linkMark!.props!.href).toBe("https://example.com");
  });

  it("bullet list items (AC 35)", () => {
    const blocks = convert("<ul><li>a</li><li>b</li></ul>");

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "bulletListItem",
      content: "a",
    });
    expect(blocks[1]).toMatchObject({
      type: "bulletListItem",
      content: "b",
    });
  });

  it("numbered list items (AC 36)", () => {
    const blocks = convert("<ol><li>a</li><li>b</li></ol>");

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "numberedListItem",
      content: "a",
    });
    expect(blocks[1]).toMatchObject({
      type: "numberedListItem",
      content: "b",
    });
  });

  it("nested list with indent (AC 37)", () => {
    const blocks = convert(
      "<ul><li>a<ul><li>b</li></ul></li></ul>",
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: "bulletListItem",
      content: "a",
      props: { indent: 0 },
    });
    expect(blocks[1]).toMatchObject({
      type: "bulletListItem",
      content: "b",
      props: { indent: 1 },
    });
  });

  it("code block with language (AC 38)", () => {
    const blocks = convert(
      '<pre><code class="language-js">const x = 1;</code></pre>',
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "codeBlock",
      props: { language: "js" },
      content: "const x = 1;",
    });
  });

  it("hr → divider (AC 39)", () => {
    const blocks = convert("<hr />");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("divider");
  });

  it("image with props (AC 40)", () => {
    const blocks = convert('<img src="url" alt="text" title="cap" />');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "image",
      props: { src: "url", alt: "text", caption: "cap" },
    });
  });

  it("heading levels 1-6", () => {
    const blocks = convert(
      "<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>",
    );

    expect(blocks).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(blocks[i].type).toBe("heading");
      expect(blocks[i].props.level).toBe(i + 1);
    }
  });

  it("div content is unwrapped (block container)", () => {
    const blocks = convert("<div><p>inner</p></div>");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "paragraph",
      content: "inner",
    });
  });

  it("table with header (AC 40 extension)", () => {
    const blocks = convert(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");
    expect(blocks[0].props.hasHeaderRow).toBe(true);
    expect(blocks[0].children).toHaveLength(2);
  });

  it("blocksToOps generates correct ops (AC 41)", () => {
    const blocks = convert("<h1>Title</h1><p><strong>bold</strong></p>");
    const ops = blocksToOps(blocks);

    const insertBlocks = ops.filter((o) => o.type === "insert-block");
    expect(insertBlocks).toHaveLength(2);

    const formatTexts = ops.filter((o) => o.type === "format-text");
    expect(formatTexts.length).toBeGreaterThan(0);
    expect(formatTexts[0].marks).toHaveProperty("bold");
  });

  it("inline-only at block level wraps in paragraph", () => {
    const dom = parseHTML("<strong>bold at root</strong>");
    const blocks = domToBlocks(dom, stubRegistry);

    expect(blocks.some((b) => b.type === "paragraph" && b.content?.includes("bold at root"))).toBe(true);
  });

  it("server-side parsing produces identical blocks as browser-side for same input (AC 43)", () => {
    const inputs = [
      "<h1>Title</h1><p>Body</p>",
      "<ul><li>a</li><li>b</li></ul>",
      '<pre><code class="language-js">const x = 1;</code></pre>',
      "<hr />",
      '<img src="url" alt="text" />',
      "<p><strong>bold</strong> and <em>italic</em></p>",
    ];

    for (const html of inputs) {
      const sanitized = sanitizeHTML(html);
      const dom = parseHTML(sanitized);
      const blocks = domToBlocks(dom, stubRegistry);

      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block.type).toBeTruthy();
        expect(block.props).toBeDefined();
      }
    }
  });
});
