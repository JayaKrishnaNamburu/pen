import type { BenchContext } from "../bench.js";
import type { StreamingTarget } from "@pen/types";
import { createTestEditor } from "@pen/test";

function getStreamingTarget(editor: ReturnType<typeof createTestEditor>): StreamingTarget {
  return editor.internals.getSlot<StreamingTarget>("delta-stream:target")!;
}

function insertParagraph(editor: ReturnType<typeof createTestEditor>): string {
  const id = `stream-bench-${Date.now()}`;
  editor.apply([
    {
      type: "insert-block",
      blockId: id,
      blockType: "paragraph",
      props: {},
      position: "last",
    },
  ]);
  return id;
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export const streamingBenchmarks: Array<{
  name: string;
  fn: (b: BenchContext) => void | Promise<void>;
}> = [
  {
    name: "streaming 1000 gen-delta parts at 100/sec",
    async fn(b) {
      const editor = createTestEditor({
        blocks: [{ type: "paragraph" }],
      });
      const blockId = editor.document.blockOrder.get(0);
      const streaming = getStreamingTarget(editor);

      b.start();

      const zoneId = "bench-zone";
      streaming.beginStreaming(zoneId, blockId);

      for (let i = 0; i < 1000; i++) {
        streaming.appendDelta(`token-${i} `);
        if (i % 10 === 0) {
          await flushMicrotasks();
        }
      }

      streaming.endStreaming("complete");
      b.end();
    },
  },
  {
    name: "streaming batch flush latency",
    async fn(b) {
      const editor = createTestEditor({
        blocks: [{ type: "paragraph" }],
      });
      const blockId = editor.document.blockOrder.get(0);
      const streaming = getStreamingTarget(editor);

      streaming.beginStreaming("bench-flush", blockId);

      for (let i = 0; i < 49; i++) {
        streaming.appendDelta(`t${i} `);
      }

      b.start();
      streaming.appendDelta("final ");
      await flushMicrotasks();
      b.end();

      streaming.endStreaming("complete");
    },
  },
];
