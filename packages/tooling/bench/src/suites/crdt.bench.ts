import type { BenchContext } from "../bench.js";
import { createLargeDocument } from "../fixtures/large-doc.js";
import { yjsAdapter, initBlockMap } from "@pen/crdt-yjs";
import type { YjsCRDTDocument } from "@pen/crdt-yjs";

export const crdtBenchmarks: Array<{
  name: string;
  fn: (b: BenchContext) => void | Promise<void>;
}> = [
  {
    name: "insert 1000 blocks sequentially",
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
    name: "encodeState 500-block document",
    fn(b) {
      const { doc, adapter } = createLargeDocument(500);
      b.start();
      adapter.encodeState(doc);
      b.end();
    },
  },
  {
    name: "loadDocument 500-block document",
    fn(b) {
      const { doc, adapter } = createLargeDocument(500);
      const binary = adapter.encodeState(doc);
      b.start();
      adapter.loadDocument(binary);
      b.end();
    },
  },
  {
    name: "fork + merge 100-block document",
    fn(b) {
      const { doc, adapter } = createLargeDocument(100);
      b.start();
      const forked = adapter.fork!(doc);
      adapter.merge!(doc, forked);
      b.end();
    },
  },
];
