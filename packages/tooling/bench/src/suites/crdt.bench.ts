import type { BenchContext, BenchDefinition } from "../bench";
import { createLargeDocument } from "../fixtures/largeDoc";
import { yjsAdapter, initBlockMap } from "@input/pen-crdt-yjs";
import type { YjsCRDTDocument } from "@input/pen-crdt-yjs";
import {
  CRDT_ENCODE_STATE_500_BENCH,
  CRDT_FORK_MERGE_100_BENCH,
  CRDT_INSERT_1000_BLOCKS_BENCH,
  CRDT_LOAD_DOCUMENT_500_BENCH,
} from "../constants/benchmarks";
import {
  FORK_MERGE_BLOCK_COUNT,
  FORK_MERGE_BLOCK_ID,
  FORK_MERGE_TOKEN,
  assertMergeTransferred,
  createDivergedFork,
  readBlockText,
} from "../fixtures/crdtForkMerge";
import { emptyTimerFloor } from "../harness/floor";

export const CRDT_INSERT_BLOCK_COUNT = 1000;

export function createInsertBlocksRunner(
  options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
  return {
    fn(b: BenchContext) {
      const adapter = yjsAdapter();
      const doc = adapter.createDocument() as YjsCRDTDocument;

      b.start();
      if (!options.skip) {
        adapter.transact(doc, () => {
          const blocks = doc.penDocument.blocks;
          const blockOrder = doc.penDocument.blockOrder;
          for (let i = 0; i < CRDT_INSERT_BLOCK_COUNT; i++) {
            const id = `block-${i}`;
            initBlockMap(blocks, id, "paragraph", "inline");
            blockOrder.push([id]);
          }
        });
      }
      b.end();
      b.observe(
        "insertedBlockCount",
        doc.penDocument.blockOrder.length,
        CRDT_INSERT_BLOCK_COUNT,
      );
    },
  };
}

export const crdtBenchmarks: BenchDefinition[] = [
  {
    ...CRDT_INSERT_1000_BLOCKS_BENCH,
    fn: createInsertBlocksRunner().fn,
  },
  {
    ...CRDT_ENCODE_STATE_500_BENCH,
    fn(b) {
      const { doc, adapter } = createLargeDocument(500);
      b.start();
      const encoded = adapter.encodeState(doc);
      b.end();
      b.observe("encodedBytes", encoded.byteLength > 0 ? 1 : 0, 1);
      b.setMetrics({
        encodedBytes: encoded.byteLength,
        sourceBlockCount: doc.penDocument.blockOrder.length,
      });
    },
  },
  {
    ...CRDT_LOAD_DOCUMENT_500_BENCH,
    fn(b) {
      const { doc, adapter } = createLargeDocument(500);
      const binary = adapter.encodeState(doc);
      b.start();
      const loaded = adapter.loadDocument(binary) as YjsCRDTDocument;
      b.end();
      b.observe(
        "loadedBlockCount",
        loaded.penDocument.blockOrder.length,
        500,
      );
    },
  },
  {
    ...CRDT_FORK_MERGE_100_BENCH,
    floor: emptyTimerFloor,
    fn: createForkMergeRunner().fn,
  },
];

export function createForkMergeRunner(
  options: { merge?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
  const merge = options.merge ?? true;
  return {
    fn(b: BenchContext) {
      const { adapter, doc, forked } = createDivergedFork(FORK_MERGE_BLOCK_COUNT);
      b.start();
      if (merge) {
        adapter.merge!(doc, forked);
      }
      b.end();
      b.observe(
        "mergeTransferred",
        readBlockText(doc, FORK_MERGE_BLOCK_ID).includes(FORK_MERGE_TOKEN)
          ? 1
          : 0,
        1,
      );
      assertMergeTransferred(doc, FORK_MERGE_BLOCK_ID, FORK_MERGE_TOKEN);
      b.setMetrics({
        blockCount: doc.penDocument.blockOrder.length,
        namedBlock: FORK_MERGE_BLOCK_ID,
        tokenLength: FORK_MERGE_TOKEN.length,
      });
    },
  };
}
