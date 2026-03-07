import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter.js";
import { createYjsDocument, initBlockMap } from "../document.js";
import {
  createYjsSnapshot,
  forkDocument,
  mergeDocuments,
  mergeYjsUpdates,
  restoreYjsSnapshot,
} from "../snapshots.js";

describe("snapshots", () => {
  const adapter = yjsAdapter({ gc: false });

  describe("createSnapshot / restoreSnapshot", () => {
    it("restores document to snapshot state", () => {
      const doc = createYjsDocument(adapter, { gc: false });
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
        doc.penDocument.blockOrder.push(["b1"]);
      });

      const block = doc.penDocument.blocks.get("b1")!;
      const ytext = block.get("content") as Y.Text;
      doc.ydoc.transact(() => {
        ytext.insert(0, "Snapshot state");
      });

      const snapshot = createYjsSnapshot(doc);

      doc.ydoc.transact(() => {
        ytext.insert(14, " + more");
      });

      const restored = restoreYjsSnapshot(adapter, doc, snapshot);
      const restoredBlock = restored.penDocument.blocks.get("b1")!;
      const restoredText = restoredBlock.get("content") as Y.Text;
      expect(restoredText.toString()).toBe("Snapshot state");
    });
  });

  describe("mergeYjsUpdates", () => {
    it("compacts multiple updates into one", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        doc.penDocument.blockOrder.push(["b1"]);
      });

      const update1 = Y.encodeStateAsUpdate(doc.ydoc);

      doc.ydoc.transact(() => {
        doc.penDocument.blockOrder.push(["b2"]);
      });

      const update2 = Y.encodeStateAsUpdate(doc.ydoc);

      const merged = mergeYjsUpdates([update1, update2]);

      const freshDoc = new Y.Doc();
      Y.applyUpdate(freshDoc, merged);
      expect(freshDoc.getArray("blockOrder").toArray()).toEqual(["b1", "b2"]);
    });
  });

  describe("forkDocument", () => {
    it("creates an independent copy with different clientID", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
        doc.penDocument.blockOrder.push(["b1"]);
      });

      const forked = forkDocument(adapter, doc);
      expect(forked.ydoc.clientID).not.toBe(doc.ydoc.clientID);
      expect(forked.penDocument.blockOrder.toArray()).toEqual(["b1"]);
    });

    it("preserves gc: false on fork", () => {
      const doc = createYjsDocument(adapter, { gc: false });
      const forked = forkDocument(adapter, doc);
      expect(forked.ydoc.gc).toBe(false);
    });
  });

  describe("mergeDocuments", () => {
    it("merges fork changes back to target", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
        doc.penDocument.blockOrder.push(["b1"]);
      });

      const forked = forkDocument(adapter, doc);
      forked.ydoc.transact(() => {
        initBlockMap(forked.penDocument.blocks, "b2", "heading", "inline");
        forked.penDocument.blockOrder.push(["b2"]);
      });

      mergeDocuments(doc, forked);
      expect(doc.penDocument.blockOrder.toArray()).toEqual(["b1", "b2"]);
      expect(doc.penDocument.blocks.has("b2")).toBe(true);
    });

    it("merge is idempotent", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        doc.penDocument.blockOrder.push(["b1"]);
      });

      const forked = forkDocument(adapter, doc);
      forked.ydoc.transact(() => {
        forked.penDocument.blockOrder.push(["b2"]);
      });

      mergeDocuments(doc, forked);
      const state1 = Y.encodeStateAsUpdate(doc.ydoc);

      mergeDocuments(doc, forked);
      const state2 = Y.encodeStateAsUpdate(doc.ydoc);

      expect(state1).toEqual(state2);
    });
  });
});
