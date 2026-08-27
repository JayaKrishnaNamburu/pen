import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { jsonExporter } from "../exporter";
import { jsonImporter, parseJsonDocument } from "../importer";
import { defaultSchema } from "@input/pen-schema";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

function createBareEditor() {
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
  return editor;
}

describe("@input/pen-interop/json import", () => {
  it("imports a valid document and preserves block ids", async () => {
    const editor = createBareEditor();

    const result = await jsonImporter.import(
      {
        version: 1,
        blocks: [
          {
            id: "parent",
            type: "toggle",
            props: {},
            children: [
              {
                id: "child",
                type: "paragraph",
                props: {},
                content: {
                  text: "Hello",
                  marks: [{ type: "bold", start: 0, end: 5 }],
                },
              },
            ],
          },
        ],
      },
      editor,
    );

    expect(result).toBeDefined();
    if (!result) {
      throw new Error("Expected import result.");
    }

    expect(result.importedTopLevelBlockCount).toBe(1);
    expect(editor.getBlock("parent")).not.toBeNull();
    expect(editor.getBlock("child")?.textContent()).toBe("Hello");
    expect(editor.getBlock("parent")?.children[0]?.id).toBe("child");

    editor.destroy();
  });

  it("imports inline node segments and round-trips them deterministically", async () => {
    const target = createBareEditor();

    await jsonImporter.import(
      {
        version: 1,
        blocks: [
          {
            id: "b1",
            type: "paragraph",
            props: {},
            content: {
              text: "Hello  world",
              segments: [
                { type: "text", text: "Hello " },
                {
                  type: "node",
                  nodeType: "mention",
                  props: { id: "user-1", label: "Ada" },
                },
                { type: "text", text: " world" },
              ],
            },
          },
        ],
      },
      target,
      { replace: true },
    );

    const reexported = await jsonExporter.export(target);

    expect(reexported.blocks[0]).toMatchObject({
      id: "b1",
      type: "paragraph",
      content: {
        text: "Hello  world",
        segments: [
          { type: "text", text: "Hello " },
          {
            type: "node",
            nodeType: "mention",
            props: { id: "user-1", label: "Ada" },
          },
          { type: "text", text: " world" },
        ],
      },
    });

    target.destroy();
  });

  it("round-trips export and import deterministically for canonical ids", async () => {
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
        type: "splice-text",
        blockId: "b1",
        from: 0,
				to: 0,
				insert: "Hello world",
      },
      {
        type: "format-text",
        blockId: "b1",
        from: 6,
        to: 11,
        marks: { italic: true },
      },
    ]);

    const exported = await jsonExporter.export(source);
    const target = createBareEditor();
    await jsonImporter.import(exported, target);
    const reexported = await jsonExporter.export(target);

    expect(reexported).toEqual(exported);

    source.destroy();
    target.destroy();
  });

  it("imports table structured content", async () => {
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
        type: "splice-text",
        blockId: "table-1",
        cell: { row: 0, col: 0 },
        from: 0,
        to: 0,
        insert: "A1",
      },
    ]);

    const exported = await jsonExporter.export(source);
    const target = createBareEditor();
    await jsonImporter.import(exported, target);
    const reexported = await jsonExporter.export(target);

    expect(reexported).toEqual(exported);

    source.destroy();
    target.destroy();
  });

  it("rejects unsupported versions", () => {
    const editor = createBareEditor();

    expect(() =>
      jsonImporter.import(
        {
          version: 2,
          blocks: [],
        } as never,
        editor,
      ),
    ).toThrow("Unsupported Pen JSON document version.");

    editor.destroy();
  });

  it("refuses an oversize JSON string before parse", () => {
    const oversize = `{"version":1,"blocks":[]}${"x".repeat(1_048_576)}`;
    expect(oversize.length).toBeGreaterThan(1_048_576);
    expect(() => parseJsonDocument(oversize)).toThrow(/INGEST_MAX_TEXT_SIZE/);
  });
});
