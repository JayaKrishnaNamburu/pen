import { yjsAdapter, initBlockMap } from "@pen/crdt-yjs";
import type { YjsCRDTDocument } from "@pen/crdt-yjs";
import * as Y from "yjs";

export function createLargeDocument(blockCount: number) {
  const adapter = yjsAdapter();
  const doc = adapter.createDocument() as YjsCRDTDocument;

  adapter.transact(doc, () => {
    const blocks = doc.penDocument.blocks;
    const blockOrder = doc.penDocument.blockOrder;

    for (let i = 0; i < blockCount; i++) {
      const id = `block-${i}`;
      const type =
        i === 0
          ? "heading"
          : i % 10 === 0
            ? "heading"
            : i % 5 === 0
              ? "codeBlock"
              : "paragraph";

      initBlockMap(blocks, id, type, "inline");
      blockOrder.push([id]);

      const blockMap = blocks.get(id);
      const content = blockMap?.get("content");
      if (content instanceof Y.Text) {
        content.insert(
          0,
          `Content for block ${i}. This is some sample text that simulates real document content with varying lengths.`,
        );
      }

      if (type === "heading") {
        const props = blockMap?.get("props");
        if (props instanceof Y.Map) {
          props.set("level", (i % 3) + 1);
        }
      }
    }
  });

  return { doc, adapter, ydoc: adapter.raw<Y.Doc>(doc) };
}
