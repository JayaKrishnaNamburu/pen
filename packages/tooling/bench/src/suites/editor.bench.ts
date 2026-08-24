import type { BenchContext, BenchDefinition } from "../bench";
import { createTestEditor } from "@input/pen-test";
import {
  EDITOR_APPLY_INSERT_DELETE_BLOCK_X500_BENCH,
  EDITOR_APPLY_INSERT_TEXT_X1000_BENCH,
} from "../constants/benchmarks";

export const EDITOR_INSERT_TEXT_COUNT = 1000;
export const EDITOR_INSERT_DELETE_PAIRS = 500;

export function createInsertTextRunner(
  options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
  return {
    async fn(b: BenchContext) {
      const editor = createTestEditor({
        blocks: [{ type: "paragraph" }],
      });
      const blockId = editor.document.blockOrder.get(0);

      b.start();
      if (!options.skip) {
        for (let i = 0; i < EDITOR_INSERT_TEXT_COUNT; i++) {
          editor.apply([
            {
              type: "splice-text",
              blockId,
              from: i,
				to: i,
				insert: "x",
            },
          ]);
        }
      }
      b.end();
      b.observe(
        "insertedCharCount",
        editor.getBlock(blockId).textContent().length,
        EDITOR_INSERT_TEXT_COUNT,
      );
      await editor.destroy();
    },
  };
}

export function createInsertDeleteRunner(
  options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
  return {
    async fn(b: BenchContext) {
      const editor = createTestEditor();
      let applyCount = 0;

      b.start();
      if (!options.skip) {
        for (let i = 0; i < EDITOR_INSERT_DELETE_PAIRS; i++) {
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
          applyCount += 1;
          editor.apply([{ type: "delete-block", blockId: id }]);
          applyCount += 1;
        }
      }
      b.end();
      b.observe("applyCount", applyCount, EDITOR_INSERT_DELETE_PAIRS * 2);
      await editor.destroy();
    },
  };
}

export const editorBenchmarks: BenchDefinition[] = [
  {
    ...EDITOR_APPLY_INSERT_TEXT_X1000_BENCH,
    fn: createInsertTextRunner().fn,
  },
  {
    ...EDITOR_APPLY_INSERT_DELETE_BLOCK_X500_BENCH,
    fn: createInsertDeleteRunner().fn,
  },
];
