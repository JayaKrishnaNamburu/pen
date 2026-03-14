import type { BenchContext, BenchDefinition } from "../bench";
import { createLargeDocument } from "../fixtures/largeDoc";
import { yjsAdapter, initBlockMap } from "@pen/crdt-yjs";
import type { YjsCRDTDocument } from "@pen/crdt-yjs";
import {
  CRDT_ENCODE_STATE_500_BENCH,
  CRDT_FORK_MERGE_100_BENCH,
  CRDT_INSERT_1000_BLOCKS_BENCH,
  CRDT_LOAD_DOCUMENT_500_BENCH,
} from "../constants/benchmarks";

export const crdtBenchmarks: BenchDefinition[] = [
  {
    ...CRDT_INSERT_1000_BLOCKS_BENCH,
    fn(b) {
      const adapter = yjsAdapter();
      const doc = adapter.createDocument() as YjsCRDTDocument;

      b.start();
      adapter.transact(doc, () => {
        const blocks = doc.penDocument.blocks;
        const blockOrder = doc.penDocument.blockOrder;
        for (let i = 0; i < 1000; i++) {
          const id = `block-${i}`;
          initBlockMap(blocks, id, "paragraph", "inline");
          blockOrder.push([id]);
        }
      });
      b.end();
    },
  },
  {
    ...CRDT_ENCODE_STATE_500_BENCH,
    fn(b) {
      const { doc, adapter } = createLargeDocument(500);
      b.start();
      adapter.encodeState(doc);
      b.end();
    },
  },
  {
    ...CRDT_LOAD_DOCUMENT_500_BENCH,
    fn(b) {
      const { doc, adapter } = createLargeDocument(500);
      const binary = adapter.encodeState(doc);
      b.start();
      adapter.loadDocument(binary);
      b.end();
    },
  },
  {
    ...CRDT_FORK_MERGE_100_BENCH,
    fn(b) {
      const { doc, adapter } = createLargeDocument(100);
      b.start();
      const forked = adapter.fork!(doc);
      adapter.merge!(doc, forked);
      b.end();
    },
  },
];
