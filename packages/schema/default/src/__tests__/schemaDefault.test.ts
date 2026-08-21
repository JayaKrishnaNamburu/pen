import { describe, expect, it } from "vitest";
import {
  defaultBlocks,
  paragraph,
  heading,
  bulletListItem,
  numberedListItem,
  checkListItem,
  codeBlock,
  image,
  table,
  divider,
  callout,
  toggle,
  blockquote,
  bold,
  italic,
  underline,
  strikethrough,
  highlight,
  textColor,
  backgroundColor,
  link,
  code,
  mention,
  inlineApp,
} from "../index";
import { subdocument } from "../blocks/subdocument";

// ── AC 11: All blocks have serialize.toMarkdown ───────────
describe("AC 11 — serialize.toMarkdown", () => {
  for (const schema of defaultBlocks) {
    it(`${schema.type} has serialize.toMarkdown defined`, () => {
      expect(schema.serialize?.toMarkdown).toBeDefined();
      expect(typeof schema.serialize?.toMarkdown).toBe("function");
    });

    it(`${schema.type} has serialize.toHTML defined`, () => {
      expect(schema.serialize?.toHTML).toBeDefined();
      expect(typeof schema.serialize?.toHTML).toBe("function");
    });
  }
});

// ── AC 24: paragraph and heading serialization ────────────
describe("AC 24 — paragraph and heading serialization", () => {
  it("paragraph.serialize.toMarkdown returns plain text", () => {
    const block = { id: "1", type: "paragraph" as const, props: {}, content: "Hello world" };
    expect(paragraph.serialize!.toMarkdown!(block)).toBe("Hello world");
  });

  it("heading.serialize.toMarkdown returns #-prefixed text", () => {
    const block = { id: "1", type: "heading" as const, props: { level: 1 }, content: "Title" };
    expect(heading.serialize!.toMarkdown!(block)).toBe("# Title");
  });

  it("heading.serialize.toMarkdown with level 3", () => {
    const block = { id: "1", type: "heading" as const, props: { level: 3 }, content: "Title" };
    expect(heading.serialize!.toMarkdown!(block)).toBe("### Title");
  });

  it("divider.serialize.toMarkdown returns ---", () => {
    const block = { id: "1", type: "divider" as const, props: {}, content: "" };
    expect(divider.serialize!.toMarkdown!(block)).toBe("---");
  });

  it("bulletListItem.serialize.toMarkdown", () => {
    const block = { id: "1", type: "bulletListItem" as const, props: { indent: 0 }, content: "Item" };
    expect(bulletListItem.serialize!.toMarkdown!(block)).toBe("- Item");
  });

  it("bulletListItem.serialize.toMarkdown with indent", () => {
    const block = { id: "1", type: "bulletListItem" as const, props: { indent: 2 }, content: "Nested" };
    expect(bulletListItem.serialize!.toMarkdown!(block)).toBe("    - Nested");
  });

  it("checkListItem.serialize.toMarkdown checked", () => {
    const block = {
      id: "1",
      type: "checkListItem" as const,
      props: { indent: 0, checked: true },
      content: "Done",
    };
    expect(checkListItem.serialize!.toMarkdown!(block)).toBe("- [x] Done");
  });

  it("checkListItem.serialize.toMarkdown unchecked", () => {
    const block = {
      id: "1",
      type: "checkListItem" as const,
      props: { indent: 0, checked: false },
      content: "Todo",
    };
    expect(checkListItem.serialize!.toMarkdown!(block)).toBe("- [ ] Todo");
  });

  it("codeBlock.serialize.toMarkdown", () => {
    const block = {
      id: "1",
      type: "codeBlock" as const,
      props: { language: "ts" },
      content: "const x = 1;",
    };
    expect(codeBlock.serialize!.toMarkdown!(block)).toBe(
      "```ts\nconst x = 1;\n```",
    );
  });

  it("image.serialize.toMarkdown", () => {
    const block = {
      id: "1",
      type: "image" as const,
      props: { src: "test.png", alt: "Test" },
      content: "",
    };
    expect(image.serialize!.toMarkdown!(block)).toBe("![Test](test.png)");
  });

  it("blockquote.serialize.toMarkdown", () => {
    const block = { id: "1", type: "blockquote" as const, props: {}, content: "Quote" };
    expect(blockquote.serialize!.toMarkdown!(block)).toBe("> Quote");
  });

  it("callout.serialize.toMarkdown", () => {
    const block = {
      id: "1",
      type: "callout" as const,
      props: { type: "warning" },
      content: "Be careful",
    };
    expect(callout.serialize!.toMarkdown!(block)).toBe(
      "> **Warning:** Be careful",
    );
  });

  it("numberedListItem.serialize.toMarkdown", () => {
    const block = {
      id: "1",
      type: "numberedListItem" as const,
      props: { indent: 0 },
      content: "Item",
    };
    expect(numberedListItem.serialize!.toMarkdown!(block)).toBe("1. Item");
  });

  it("numberedListItem.serialize.toMarkdown with indent and start", () => {
    const block = {
      id: "1",
      type: "numberedListItem" as const,
      props: { indent: 2, start: 3 },
      content: "Nested",
    };
    expect(numberedListItem.serialize!.toMarkdown!(block)).toBe(
      "    3. Nested",
    );
  });

  it("toggle.serialize.toMarkdown", () => {
    const block = {
      id: "1",
      type: "toggle" as const,
      props: { open: true },
      content: "Summary",
    };
    expect(toggle.serialize!.toMarkdown!(block)).toBe(
      "<details>\n<summary>Summary</summary>\n</details>",
    );
  });

  it("table.serialize.toMarkdown includes nested cell children", () => {
    const block = {
      id: "1",
      type: "table" as const,
      props: { hasHeaderRow: true },
      content: "",
      children: [
        {
          id: "r1",
          type: "tableRow",
          props: {},
          content: "",
          children: [
            { id: "c1", type: "tableCell", props: {}, content: "A" },
            { id: "c2", type: "tableCell", props: {}, content: "B" },
          ],
        },
        {
          id: "r2",
          type: "tableRow",
          props: {},
          content: "",
          children: [
            { id: "c3", type: "tableCell", props: {}, content: "C" },
            { id: "c4", type: "tableCell", props: {}, content: "D" },
          ],
        },
      ],
    };
    expect(table.serialize!.toMarkdown!(block)).toBe(
      "| A | B |\n| --- | --- |\n| C | D |",
    );
  });

  it("subdocument.serialize.toMarkdown", () => {
    const block = {
      id: "1",
      type: "subdocument" as const,
      props: { subdocumentGuid: "guid-1" },
      content: "",
    };
    expect(subdocument.serialize!.toMarkdown!(block)).toBe(
      "<!-- pen-subdocument:guid-1 -->",
    );
  });
});

// ── AC 23: Mark priority ordering ─────────────────────────
describe("AC 23 — Mark priority ordering", () => {
  it("priorities are in correct ascending order", () => {
    expect(bold.priority).toBeLessThan(italic.priority!);
    expect(italic.priority).toBeLessThan(underline.priority!);
    expect(underline.priority).toBeLessThan(strikethrough.priority!);
    expect(strikethrough.priority).toBeLessThan(highlight.priority!);
    expect(highlight.priority).toBeLessThan(textColor.priority!);
    expect(textColor.priority).toBeLessThan(backgroundColor.priority!);
    expect(backgroundColor.priority).toBeLessThan(link.priority!);
    expect(link.priority).toBeLessThan(code.priority!);
  });

  it("bold has priority 100", () => {
    expect(bold.priority).toBe(100);
  });

  it("code has priority 900", () => {
    expect(code.priority).toBe(900);
  });
});

// ── Inline mark properties ────────────────────────────────
describe("inline mark properties", () => {
  it("bold is a mark with expand: after", () => {
    expect(bold.kind).toBe("mark");
    expect(bold.expand).toBe("after");
  });

  it("link is a mark with expand: none", () => {
    expect(link.kind).toBe("mark");
    expect(link.expand).toBe("none");
  });

  it("code is a mark with expand: none", () => {
    expect(code.kind).toBe("mark");
    expect(code.expand).toBe("none");
  });

  it("mention is a node", () => {
    expect(mention.kind).toBe("node");
  });

  it("inlineApp is a node", () => {
    expect(inlineApp.kind).toBe("node");
  });
});

// ── Block display metadata ────────────────────────────────
describe("block display metadata", () => {
  for (const schema of defaultBlocks) {
    it(`${schema.type} has display metadata`, () => {
      expect(schema.display).toBeDefined();
      expect(schema.display?.title).toBeTruthy();
    });
  }
});

// ── DIR1: optional direction on text-capable blocks ────────
describe("DIR1 — optional direction prop", () => {
  const textCapable = defaultBlocks.filter(
    (schema) => schema.propSchema.direction,
  );
  const nonText = defaultBlocks.filter(
    (schema) => !schema.propSchema.direction,
  );

  for (const schema of textCapable) {
    it(`DIR1: ${schema.type} has optional direction ltr|rtl|auto`, () => {
      expect(schema.propSchema.direction?.enum).toEqual(["ltr", "rtl", "auto"]);
      expect(schema.propSchema.direction?.type).toEqual(["string", "null"]);
      expect(schema.propSchema.direction?.default).toBeUndefined();
    });
  }

  it("DIR1: non-text blocks do not declare direction", () => {
    expect(nonText.length).toBeGreaterThan(0);
    for (const schema of nonText) {
      expect(schema.propSchema.direction).toBeUndefined();
    }
  });
});

describe("heading.normalize", () => {
  it("clamps out-of-range levels and a second pass is a no-op", () => {
    for (const level of [0, 7, -3, 99]) {
      const block = {
        id: "h",
        type: "heading" as const,
        props: { level },
        content: "Title",
      };
      const once = heading.normalize!(block);
      const twice = heading.normalize!(once);
      expect(once.props.level).toBeGreaterThanOrEqual(1);
      expect(once.props.level).toBeLessThanOrEqual(6);
      expect(twice).toBe(once);
    }
  });

  it("leaves an already-valid heading as the same object", () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const block = {
        id: "h",
        type: "heading" as const,
        props: { level },
        content: "Title",
      };
      expect(heading.normalize!(block)).toBe(block);
    }

    const missingLevel = {
      id: "h",
      type: "heading" as const,
      props: {},
      content: "Title",
    };
    expect(heading.normalize!(missingLevel)).toBe(missingLevel);
  });
});

describe("AX4 — default atom and widget a11y specs", () => {
  it("AX4: mention, inlineApp, and image each have an a11y label", () => {
    expect(typeof mention.a11y?.label).toBe("function");
    expect(typeof inlineApp.a11y?.label).toBe("function");
    expect(typeof image.a11y?.label).toBe("function");
    expect(
      typeof mention.a11y?.label === "function"
        ? mention.a11y.label({ label: "Ada" })
        : "",
    ).toBe("@Ada");
    expect(
      typeof inlineApp.a11y?.label === "function"
        ? inlineApp.a11y.label({ appType: "calendar" })
        : "",
    ).toBe("calendar");
    expect(
      typeof image.a11y?.label === "function"
        ? image.a11y.label({ alt: "Harbor" })
        : "",
    ).toBe("Harbor");
  });
});
