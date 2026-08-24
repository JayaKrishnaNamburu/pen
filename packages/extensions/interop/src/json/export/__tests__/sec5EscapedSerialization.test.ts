import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { jsonExporter } from "../exporter";
import { jsonImporter } from "../importer";
import { defaultSchema } from "@input/pen-schema-default";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

const HOSTILE_PLAIN_TEXTS = [
  `<script>alert("xss")</script>`,
  `foo & bar < baz > 'qux' "quux"`,
  `"><img src=x onerror=alert(1)>`,
];

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

function collectPlainText(editor: ReturnType<typeof createEditor>): string {
  return [...editor.documentState.allBlocks()]
    .map((handle) => handle.textContent())
    .join("");
}

describe("SEC5 JSON serialization", () => {
  it.each(HOSTILE_PLAIN_TEXTS)(
    "SEC5 round-trips hostile plain text %j through export and import",
    async (text) => {
      const source = createBareEditor();
      source.apply([
        {
          type: "insert-block",
          blockId: "b1",
          blockType: "paragraph",
          props: {},
          position: "last",
        },
        { type: "splice-text", blockId: "b1", from: 0, to: 0, insert: text },
      ]);

      const document = await jsonExporter.export(source);
      const serialized = JSON.stringify(document);
      expect(document.blocks[0]?.content?.text).toBe(text);
      expect(JSON.parse(serialized).blocks[0].content.text).toBe(text);

      const target = createBareEditor();
      await jsonImporter.import(serialized, target);

      expect(collectPlainText(target)).toBe(text);

      source.destroy();
      target.destroy();
    },
  );
});
