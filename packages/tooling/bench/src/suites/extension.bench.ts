import type { BenchContext } from "../bench";
import type { Editor } from "@pen/types";
import { createTestEditor } from "@pen/test";
import { defineExtension } from "@pen/types";

function makeNoopExtension(name: string) {
  return defineExtension({
    name,
    observe(_events, _editor) {
      // intentional no-op for dispatch overhead measurement
    },
    decorations(_state, _editor) {
      return { decorations: [] } as any;
    },
  });
}

function createTestEditorWithExtensions(count: number) {
  const extensions = Array.from({ length: count }, (_, i) =>
    makeNoopExtension(`bench-ext-${i}`),
  );
  return createTestEditor({
    extensions,
    blocks: [{ type: "paragraph", content: "benchmark content" }],
  });
}

export const extensionBenchmarks: Array<{
  name: string;
  fn: (b: BenchContext) => void | Promise<void>;
}> = [
  {
    name: "extension dispatchObserve with 5 extensions",
    fn(b) {
      const editor = createTestEditorWithExtensions(5);
      const blockId = editor.document.blockOrder.get(0);

      b.start();
      editor.apply([
        {
          type: "insert-text",
          blockId,
          offset: 0,
          text: "benchmark text",
        },
      ]);
      b.end();
    },
  },
  {
    name: "extension collectDecorations with 5 extensions",
    fn(b) {
      const editor = createTestEditorWithExtensions(5) as unknown as Editor;

      b.start();
      for (let i = 0; i < 1000; i++) {
        editor.getDecorations();
      }
      b.end();
    },
  },
];
