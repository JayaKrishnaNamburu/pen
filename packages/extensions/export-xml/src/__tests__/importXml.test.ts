import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import type { DocumentOp } from "@pen/types";
import { xmlExporter } from "../exporter";
import { xmlImporter } from "../importer";

type UpdateTableColumnsOp = Extract<DocumentOp, { type: "update-table-columns" }>;
type DatabaseInsertRowOp = Extract<DocumentOp, { type: "database-insert-row" }>;

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

describe("@pen/export-xml import", () => {
  it("imports valid XML and preserves block ids", async () => {
    const editor = createBareEditor();

    const result = await xmlImporter.import(
      `<?xml version="1.0" encoding="UTF-8"?>
<pen-document version="1">
  <block id="parent" type="toggle">
    <props>{}</props>
    <children>
      <block id="child" type="paragraph">
        <props>{}</props>
        <content>Hello</content>
        <marks>
          <mark type="bold" start="0" end="5" />
        </marks>
      </block>
    </children>
  </block>
</pen-document>`,
      editor,
    );

    expect(result).toBeDefined();
    if (!result) {
      throw new Error("Expected import result.");
    }

    expect(result.importedTopLevelBlockCount).toBe(1);
    expect(editor.getBlock("parent")).not.toBeNull();
    expect(editor.getBlock("child")?.textContent()).toBe("Hello");

    editor.destroy();
  });

  it("round-trips nested and marked content deterministically", async () => {
    const source = createBareEditor();
    source.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "b1",
        offset: 0,
        text: "Hello world",
      },
      {
        type: "format-text",
        blockId: "b1",
        offset: 6,
        length: 5,
        marks: { italic: true },
      },
    ]);

    const exported = await xmlExporter.export(source);
    const target = createBareEditor();
    await xmlImporter.import(exported, target, { replace: true });
    const reexported = await xmlExporter.export(target);

    expect(reexported).toEqual(exported);

    source.destroy();
    target.destroy();
  });

  it("round-trips inline node segments deterministically", async () => {
    const editor = createBareEditor();

    await xmlImporter.import(
      `<?xml version="1.0" encoding="UTF-8"?>
<pen-document version="1">
  <block id="b1" type="paragraph">
    <props>{}</props>
    <content>Hello  world</content>
    <segments>
      <text>Hello </text>
      <node type="mention" props="{&quot;id&quot;:&quot;user-1&quot;,&quot;label&quot;:&quot;Ada&quot;}" />
      <text> world</text>
    </segments>
  </block>
</pen-document>`,
      editor,
      { replace: true },
    );

    const reexported = await xmlExporter.export(editor);

    expect(reexported).toContain("<segments>");
    expect(reexported).toContain('<node type="mention" props="{&quot;id&quot;:&quot;user-1&quot;,&quot;label&quot;:&quot;Ada&quot;}" />');

    editor.destroy();
  });

  it("round-trips table and database content deterministically", async () => {
    const source = createBareEditor();
    source.apply([
      {
        type: "insert-block",
        blockId: "table-1",
        blockType: "table",
        props: {},
        position: "last",
      },
      {
        type: "insert-table-cell-text",
        blockId: "table-1",
        row: 0,
        col: 0,
        offset: 0,
        text: "A1",
      },
      {
        type: "insert-block",
        blockId: "db-1",
        blockType: "database",
        props: { title: "Roadmap", dataSource: "local" },
        position: "last",
      },
      {
        type: "update-table-columns",
        blockId: "db-1",
        columns: [{ id: "name", title: "Name", type: "text" }],
      } as UpdateTableColumnsOp,
      {
        type: "database-insert-row",
        blockId: "db-1",
        rowId: "row-1",
        values: { name: "Ship XML" },
      } as DatabaseInsertRowOp,
    ]);

    const exported = await xmlExporter.export(source);
    const target = createBareEditor();
    await xmlImporter.import(exported, target, { replace: true });
    const reexported = await xmlExporter.export(target);

    expect(reexported).toEqual(exported);

    source.destroy();
    target.destroy();
  });

  it("rejects unsupported XML versions", () => {
    expect(() =>
      xmlImporter.parse?.(
        `<?xml version="1.0" encoding="UTF-8"?><pen-document version="2"></pen-document>`,
        {} as never,
      ),
    ).toThrow("Unsupported Pen XML document version.");
  });
});
