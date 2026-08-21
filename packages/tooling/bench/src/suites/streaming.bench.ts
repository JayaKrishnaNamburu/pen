import type { BenchContext, BenchDefinition } from "../bench";
import type { StreamingTarget } from "@input/pen-types";
import { deltaStreamExtension } from "@input/pen-delta-stream";
import { createTestEditor } from "@input/pen-test";
import {
  STREAMING_BATCH_FLUSH_LATENCY_BENCH,
  STREAMING_GEN_DELTA_1000_PARTS_BENCH,
} from "../constants/benchmarks";

function createStreamingBenchEditor() {
  return createTestEditor({
    blocks: [{ type: "paragraph" }],
    extensions: [deltaStreamExtension()],
  });
}

function getStreamingTarget(editor: ReturnType<typeof createTestEditor>): StreamingTarget {
  const streaming = editor.internals.getSlot<StreamingTarget>("delta-stream:target");
  if (!streaming) {
    throw new Error("Streaming bench editor is missing the delta-stream target.");
  }
  return streaming;
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

export const streamingBenchmarks: BenchDefinition[] = [
  {
    ...STREAMING_GEN_DELTA_1000_PARTS_BENCH,
    async fn(b) {
      const editor = createStreamingBenchEditor();
      await editor.whenReady();
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
      await editor.destroy();
    },
  },
  {
    ...STREAMING_BATCH_FLUSH_LATENCY_BENCH,
    async fn(b) {
      const editor = createStreamingBenchEditor();
      await editor.whenReady();
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
      await editor.destroy();
    },
  },
];
