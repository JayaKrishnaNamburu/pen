import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { DocumentOp } from "@input/pen-types";
import { xmlExporter } from "../exporter";
import { serializePenDocumentToXml } from "../serializer";
import { defaultSchema } from "@input/pen-schema-default";

type InsertTableCellTextOp = Extract<DocumentOp, { type: "insert-table-cell-text" }>;
type FormatTableCellTextOp = Extract<DocumentOp, { type: "format-table-cell-text" }>;

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

function editorWithOps(ops: Parameters<ReturnType<typeof createEditor>["apply"]>[0]) {
  const editor = createEditor({
    schema: defaultSchema, preset: noDefaultExtensionsPreset,
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
  editor.apply(ops);
  return editor;
}

describe("SEC1 url policy", () => {
  it("SEC1: keeps allowed href and src values", () => {
    const xml = serializePenDocumentToXml({
      version: 1,
      blocks: [
        {
          id: "img",
          type: "image",
          props: {
            src: "/images/a.png",
            alt: "Photo",
          },
        },
        {
          id: "p1",
          type: "paragraph",
          props: {},
          content: {
            text: "link",
            marks: [
              {
                type: "link",
                start: 0,
                end: 4,
                props: {
                  href: "tel:+15551212",
                  title: "Example",
                },
              },
            ],
            segments: [
              {
                type: "text",
                text: "link",
                attributes: {
                  link: { href: "mailto:user@example.com", title: "Mail" },
                },
              },
            ],
          },
        },
      ],
    });

    expect(xml).toContain("&quot;src&quot;:&quot;/images/a.png&quot;");
    expect(xml).toContain("&quot;href&quot;:&quot;tel:+15551212&quot;");
    expect(xml).toContain("&quot;href&quot;:&quot;mailto:user@example.com&quot;");
    expect(xml).toContain("&quot;title&quot;:&quot;Example&quot;");
    expect(xml).toContain("&quot;alt&quot;:&quot;Photo&quot;");
  });

  it("SEC1: omits hostile href and src without echoing the raw URL", () => {
    const blocked = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "  javascript:alert(1)",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "data:text/html,<script>alert(1)</script>",
    ];

    for (const href of blocked) {
      const xml = serializePenDocumentToXml({
        version: 1,
        blocks: [
          {
            id: "p1",
            type: "paragraph",
            props: {},
            content: {
              text: "link",
              marks: [
                {
                  type: "link",
                  start: 0,
                  end: 4,
                  props: { href, title: "Safe" },
                },
              ],
            },
          },
        ],
      });

      expect(xml).not.toContain(href);
      expect(xml).not.toContain("javascript:");
      expect(xml).not.toContain("vbscript:");
      expect(xml).not.toContain("file:");
      expect(xml).toContain("&quot;title&quot;:&quot;Safe&quot;");
    }

    for (const src of blocked) {
      const xml = serializePenDocumentToXml({
        version: 1,
        blocks: [
          {
            id: "img",
            type: "image",
            props: { src, alt: "Photo" },
          },
        ],
      });

      expect(xml).not.toContain(src);
      expect(xml).not.toContain("javascript:");
      expect(xml).toContain("&quot;alt&quot;:&quot;Photo&quot;");
    }
  });

  it("SEC1: allows data:image src and omits data:image href", () => {
    const png = "data:image/png;base64,aaa";
    const xml = serializePenDocumentToXml({
      version: 1,
      blocks: [
        {
          id: "img",
          type: "image",
          props: { src: png },
        },
        {
          id: "p1",
          type: "paragraph",
          props: {},
          content: {
            text: "link",
            marks: [
              {
                type: "link",
                start: 0,
                end: 4,
                props: { href: png },
              },
            ],
          },
        },
      ],
    });

    expect(xml).toContain(`&quot;src&quot;:&quot;${png}&quot;`);
    expect(xml).not.toContain("&quot;href&quot;");
  });

  it("SEC1: mixed-case HREF and SRC keys are URL fields, not passed through", () => {
    const xml = serializePenDocumentToXml({
      version: 1,
      blocks: [
        {
          id: "img",
          type: "image",
          props: { SRC: "javascript:alert(1)", alt: "Photo" },
        },
        {
          id: "p1",
          type: "paragraph",
          props: {},
          content: {
            text: "link",
            marks: [
              {
                type: "link",
                start: 0,
                end: 4,
                props: { HREF: "javascript:alert(1)", title: "Safe" },
              },
            ],
          },
        },
      ],
    });

    expect(xml).not.toContain("javascript:");
    expect(xml).toContain("&quot;title&quot;:&quot;Safe&quot;");
    expect(xml).toContain("&quot;alt&quot;:&quot;Photo&quot;");
  });

  it("SEC1: omits hostile href from nested segment attributes", () => {
    const xml = serializePenDocumentToXml({
      version: 1,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          props: {},
          content: {
            text: "link",
            segments: [
              {
                type: "text",
                text: "link",
                attributes: {
                  link: { href: "javascript:alert(1)", title: "Nested" },
                },
              },
            ],
          },
        },
      ],
    });

    expect(xml).not.toContain("javascript:");
    expect(xml).toContain("&quot;title&quot;:&quot;Nested&quot;");
  });

  it("SEC1: editor export omits a javascript link href", async () => {
    const editor = editorWithOps([
      {
        type: "insert-block",
        blockId: "p1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "p1",
        offset: 0,
        text: "hello",
      },
      {
        type: "format-text",
        blockId: "p1",
        offset: 0,
        length: 5,
        marks: { link: { href: "javascript:alert(1)", title: "Hello" } },
      },
      {
        type: "insert-block",
        blockId: "img",
        blockType: "image",
        props: { src: "javascript:alert(1)", alt: "X" },
        position: "last",
      },
    ]);

    const xml = await xmlExporter.export(editor);

    expect(xml).not.toContain("javascript:");
    expect(xml).toContain("&quot;title&quot;:&quot;Hello&quot;");
    expect(xml).toContain("&quot;alt&quot;:&quot;X&quot;");

    editor.destroy();
  });

  it("SEC1: omits javascript: href inside table cells", async () => {
    const editor = editorWithOps([
      {
        type: "insert-block",
        blockId: "t1",
        blockType: "table",
        props: { hasHeaderRow: false },
        position: "last",
      },
      {
        type: "insert-table-cell-text",
        blockId: "t1",
        row: 0,
        col: 0,
        offset: 0,
        text: "go",
      } as InsertTableCellTextOp,
      {
        type: "format-table-cell-text",
        blockId: "t1",
        row: 0,
        col: 0,
        offset: 0,
        length: 2,
        marks: { link: { href: "javascript:alert(1)", title: "Go" } },
      } as FormatTableCellTextOp,
    ]);

    const xml = await xmlExporter.export(editor);

    expect(xml).not.toContain("javascript:");
    expect(xml).toContain("&quot;title&quot;:&quot;Go&quot;");

    editor.destroy();
  });
});
