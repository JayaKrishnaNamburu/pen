import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { markdownExporter } from "../exporter";
import { defaultSchema } from "@input/pen-schema-default";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

const MARKDOWN_SAFE_HOSTILE_TEXT = `foo & bar < baz > 'qux' "quux"`;

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

describe("SEC5 markdown serialization", () => {
  it("SEC5 keeps hostile markup characters as plain text in the export", async () => {
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
				insert: `<script>alert("xss")</script>`,
      },
    ]);

    const markdown = await markdownExporter.export(source);
    expect(markdown).toContain(`<script>alert("xss")</script>`);

    source.destroy();
  });

  it("SEC5 preserves hostile plain text that the markdown dialect can represent", async () => {
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
				insert: MARKDOWN_SAFE_HOSTILE_TEXT,
      },
    ]);

    const markdown = await markdownExporter.export(source);
    expect(markdown).toContain(MARKDOWN_SAFE_HOSTILE_TEXT);

    source.destroy();
  });
});
