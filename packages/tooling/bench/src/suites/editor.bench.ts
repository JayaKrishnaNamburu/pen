import type { BenchContext } from "../bench";
import { createTestEditor } from "@pen/test";

export const editorBenchmarks: Array<{
  name: string;
  fn: (b: BenchContext) => void | Promise<void>;
}> = [
  {
    name: "editor.apply insert-text x1000",
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
    name: "editor.apply insert-block + delete-block x500",
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
