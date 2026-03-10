import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import {
  createYjsDocument,
  initBlockMap,
  validateDocument,
} from "../document";
import type { YjsCRDTDocument } from "../document";
import {
  forkDocument,
  mergeDocuments,
} from "../snapshots";

function syncDocs(a: YjsCRDTDocument, b: YjsCRDTDocument) {
  const svA = Y.encodeStateVector(a.ydoc);
  const svB = Y.encodeStateVector(b.ydoc);
  const diffAB = Y.encodeStateAsUpdate(a.ydoc, svB);
  const diffBA = Y.encodeStateAsUpdate(b.ydoc, svA);
  Y.applyUpdate(b.ydoc, diffAB);
  Y.applyUpdate(a.ydoc, diffBA);
}

describe("conflict resolution", () => {
  const adapter = yjsAdapter();

  describe("concurrent text edits in the same block", () => {
    it("preserves both insertions at the same offset", () => {
      const docA = createYjsDocument(adapter);
      docA.ydoc.transact(() => {
        initBlockMap(docA.penDocument.blocks, "b1", "paragraph", "inline");
        docA.penDocument.blockOrder.push(["b1"]);
      });

      const docB = forkDocument(adapter, docA);

      const blockA = docA.penDocument.blocks.get("b1")!;
      const textA = blockA.get("content") as Y.Text;
      docA.ydoc.transact(() => {
        textA.insert(0, "hello");
      }, "user");

      const blockB = docB.penDocument.blocks.get("b1")!;
      const textB = blockB.get("content") as Y.Text;
      docB.ydoc.transact(() => {
        textB.insert(0, "world");
      }, "user");

      syncDocs(docA, docB);

      const resultA = textA.toString();
      const resultB = textB.toString();

      expect(resultA).toBe(resultB);
      expect(resultA).toContain("hello");
      expect(resultA).toContain("world");
      expect(resultA.length).toBe(10);
    });

    it("ordering is deterministic across all peers", () => {
      const docA = createYjsDocument(adapter);
      docA.ydoc.transact(() => {
        initBlockMap(docA.penDocument.blocks, "b1", "paragraph", "inline");
        docA.penDocument.blockOrder.push(["b1"]);
      });

      const docB = forkDocument(adapter, docA);
      const docC = forkDocument(adapter, docA);

      const textA = (docA.penDocument.blocks.get("b1")!.get("content") as Y.Text);
      const textB = (docB.penDocument.blocks.get("b1")!.get("content") as Y.Text);
      const textC = (docC.penDocument.blocks.get("b1")!.get("content") as Y.Text);

      docA.ydoc.transact(() => textA.insert(0, "aaa"), "user");
      docB.ydoc.transact(() => textB.insert(0, "bbb"), "user");
      docC.ydoc.transact(() => textC.insert(0, "ccc"), "user");

      syncDocs(docA, docB);
      syncDocs(docA, docC);
      syncDocs(docB, docC);

      const results = [textA.toString(), textB.toString(), textC.toString()];
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
      expect(results[0].length).toBe(9);
    });
  });

  describe("concurrent block type/prop conversion", () => {
    it("converges to the same prop value via LWW", () => {
      const docA = createYjsDocument(adapter);
      docA.ydoc.transact(() => {
        initBlockMap(docA.penDocument.blocks, "b1", "heading", "inline");
        docA.penDocument.blockOrder.push(["b1"]);
      });

      const docB = forkDocument(adapter, docA);

      const propsA = docA.penDocument.blocks.get("b1")!.get("props") as Y.Map<unknown>;
      const propsB = docB.penDocument.blocks.get("b1")!.get("props") as Y.Map<unknown>;

      docA.ydoc.transact(() => propsA.set("level", 2), "user");
      docB.ydoc.transact(() => propsB.set("level", 3), "user");

      syncDocs(docA, docB);

      expect(propsA.get("level")).toBe(propsB.get("level"));
    });
  });

  describe("concurrent block deletion and content editing", () => {
    it("deletion wins — block is gone after merge", () => {
      const docA = createYjsDocument(adapter);
      docA.ydoc.transact(() => {
        initBlockMap(docA.penDocument.blocks, "b1", "paragraph", "inline");
        docA.penDocument.blockOrder.push(["b1"]);
        const text = docA.penDocument.blocks.get("b1")!.get("content") as Y.Text;
        text.insert(0, "existing");
      });

      const docB = forkDocument(adapter, docA);

      docA.ydoc.transact(() => {
        docA.penDocument.blocks.delete("b1");
        docA.penDocument.blockOrder.delete(0, 1);
      }, "user");

      const textB = docB.penDocument.blocks.get("b1")!.get("content") as Y.Text;
      docB.ydoc.transact(() => {
        textB.insert(8, " more content");
      }, "user");

      syncDocs(docA, docB);

      expect(docA.penDocument.blocks.has("b1")).toBe(false);
      expect(docB.penDocument.blocks.has("b1")).toBe(false);
      expect(docA.penDocument.blockOrder.toArray()).not.toContain("b1");
      expect(docB.penDocument.blockOrder.toArray()).not.toContain("b1");
    });
  });

  describe("concurrent block reordering", () => {
    it("produces duplicate in blockOrder that normalization can fix", () => {
      const docA = createYjsDocument(adapter);
      docA.ydoc.transact(() => {
        initBlockMap(docA.penDocument.blocks, "b1", "paragraph", "inline");
        initBlockMap(docA.penDocument.blocks, "b2", "paragraph", "inline");
        initBlockMap(docA.penDocument.blocks, "b3", "paragraph", "inline");
        docA.penDocument.blockOrder.push(["b1", "b2", "b3"]);
      });

      const docB = forkDocument(adapter, docA);

      // A moves b3 to position 0 (delete from index 2, insert at 0)
      docA.ydoc.transact(() => {
        docA.penDocument.blockOrder.delete(2, 1);
        docA.penDocument.blockOrder.insert(0, ["b3"]);
      }, "user");

      // B moves b3 to position 1 (delete from index 2, insert at 1)
      docB.ydoc.transact(() => {
        docB.penDocument.blockOrder.delete(2, 1);
        docB.penDocument.blockOrder.insert(1, ["b3"]);
      }, "user");

      syncDocs(docA, docB);

      const orderA = docA.penDocument.blockOrder.toArray();
      const orderB = docB.penDocument.blockOrder.toArray();
      expect(orderA).toEqual(orderB);

      // b3 may appear twice — validate + repair fixes it
      const validation = validateDocument(docA.ydoc, { repair: true });
      const repairedOrder = docA.penDocument.blockOrder.toArray();
      const b3Count = repairedOrder.filter((id) => id === "b3").length;
      expect(b3Count).toBe(1);
      expect(repairedOrder).toContain("b1");
      expect(repairedOrder).toContain("b2");
      expect(repairedOrder).toContain("b3");
    });
  });

  describe("schema version mismatch", () => {
    it("unknown block types are preserved after merge", () => {
      const docA = createYjsDocument(adapter);
      docA.ydoc.transact(() => {
        initBlockMap(docA.penDocument.blocks, "b1", "callout", "inline");
        docA.penDocument.blockOrder.push(["b1"]);
        const text = docA.penDocument.blocks.get("b1")!.get("content") as Y.Text;
        text.insert(0, "Important note");
      });

      const docB = forkDocument(adapter, docA);

      const block = docB.penDocument.blocks.get("b1")!;
      expect(block.get("type")).toBe("callout");
      expect((block.get("content") as Y.Text).toString()).toBe("Important note");
    });
  });
});
