import type { BenchContext, BenchDefinition } from "../bench";
import { createTestEditor } from "@pen/test";
import {
  EDITOR_APPLY_INSERT_DELETE_BLOCK_X500_BENCH,
  EDITOR_APPLY_INSERT_TEXT_X1000_BENCH,
} from "../constants/benchmarks";

export const editorBenchmarks: BenchDefinition[] = [
  {
    ...EDITOR_APPLY_INSERT_TEXT_X1000_BENCH,
    fn(b) {
      const editor = createTestEditor({
        blocks: [{ type: "paragraph" }],
      });
      const blockId = editor.document.blockOrder.get(0);

      b.start();
      for (let i = 0; i < 1000; i++) {
        editor.apply([
          {
            type: "insert-text",
            blockId,
            offset: i,
            text: "x",
          },
        ]);
      }
      b.end();
    },
  },
  {
    ...EDITOR_APPLY_INSERT_DELETE_BLOCK_X500_BENCH,
    fn(b) {
      const editor = createTestEditor();

      b.start();
      for (let i = 0; i < 500; i++) {
        const id = `bench-${i}`;
        editor.apply([
          {
            type: "insert-block",
            blockId: id,
            blockType: "paragraph",
            props: {},
            position: "last",
          },
        ]);
        editor.apply([{ type: "delete-block", blockId: id }]);
      }
      b.end();
    },
  },
];
