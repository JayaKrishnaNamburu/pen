import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import type { YjsAdapterOptions } from "../adapter";
import { isYjsCRDTDocument } from "../document";
import type { YjsCRDTDocument } from "../document";

describe("adapter", () => {
  const adapter = yjsAdapter();

  describe("encodeState / loadDocument round-trip", () => {
    it("produces an identical document after round-trip", () => {
      const doc = adapter.createDocument() as YjsCRDTDocument;

      doc.ydoc.transact(() => {
        doc.penDocument.blockOrder.push(["b1", "b2"]);
        const b1 = new Y.Map<unknown>();
        b1.set("type", "paragraph");
        b1.set("content", new Y.Text("Hello"));
        b1.set("props", new Y.Map<unknown>());
        b1.set("meta", new Y.Map<unknown>());
        doc.penDocument.blocks.set("b1", b1);

        const b2 = new Y.Map<unknown>();
        b2.set("type", "heading");
        b2.set("content", new Y.Text("World"));
        b2.set("props", new Y.Map<unknown>());
        b2.set("meta", new Y.Map<unknown>());
        doc.penDocument.blocks.set("b2", b2);
      });

      const binary = adapter.encodeState(doc);
      const restored = adapter.loadDocument(binary) as YjsCRDTDocument;

      expect(restored.penDocument.blockOrder.toArray()).toEqual(["b1", "b2"]);
      const restoredB1 = restored.penDocument.blocks.get("b1")!;
      expect((restoredB1.get("content") as Y.Text).toString()).toBe("Hello");
    });

    it("initializes missing shared roots when loading partial updates", () => {
      const diagnostics: Array<{ code: string; message: string }> = [];
      const adapterWithDiagnostics = yjsAdapter({
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      });
      const ydoc = new Y.Doc();
      ydoc.getMap("blocks");
      const binary = Y.encodeStateAsUpdate(ydoc);

      const restored = adapterWithDiagnostics.loadDocument(binary) as YjsCRDTDocument;

      expect(restored).toBeTruthy();
      expect(diagnostics).toEqual([]);
      expect(restored.penDocument.blocks).toBeInstanceOf(Y.Map);
      expect(restored.penDocument.blockOrder).toBeInstanceOf(Y.Array);
    });
  });

  describe("encodeUpdate with state vector", () => {
    it("produces only the delta since the state vector", () => {
      const doc = adapter.createDocument() as YjsCRDTDocument;
      const stateVector = Y.encodeStateVector(doc.ydoc);

      doc.ydoc.transact(() => {
        doc.penDocument.blockOrder.push(["b1"]);
        const b1 = new Y.Map<unknown>();
        b1.set("type", "paragraph");
        doc.penDocument.blocks.set("b1", b1);
      });

      const delta = adapter.encodeUpdate(doc, stateVector);

      const fresh = new Y.Doc();
      Y.applyUpdate(fresh, delta);
      expect(fresh.getArray("blockOrder").toArray()).toEqual(["b1"]);
    });
  });

  describe("applyUpdate", () => {
    it("applies remote update to local doc", () => {
      const doc1 = adapter.createDocument() as YjsCRDTDocument;
      const doc2 = adapter.createDocument() as YjsCRDTDocument;

      doc1.ydoc.transact(() => {
        doc1.penDocument.blockOrder.push(["b1"]);
      });

      const update = Y.encodeStateAsUpdate(doc1.ydoc);
      adapter.applyUpdate(doc2, update);

      expect(doc2.penDocument.blockOrder.toArray()).toEqual(["b1"]);
    });
  });

  describe("transact", () => {
    it("batches multiple writes into a single observe event", () => {
      const doc = adapter.createDocument();
      const events: unknown[] = [];
      adapter.observe(doc, (e) => events.push(e));

      adapter.transact(doc, () => {
        const yjsDoc = doc as YjsCRDTDocument;
        yjsDoc.penDocument.blockOrder.push(["b1", "b2"]);
      });

      expect(events).toHaveLength(1);
    });
  });

  describe("getClientId", () => {
    it("returns a stable number", () => {
      const doc = adapter.createDocument();
      const id1 = adapter.getClientId(doc);
      const id2 = adapter.getClientId(doc);
      expect(typeof id1).toBe("number");
      expect(id1).toBe(id2);
    });
  });

  describe("raw", () => {
    it("returns the underlying Y.Doc", () => {
      const doc = adapter.createDocument();
      const ydoc = adapter.raw<Y.Doc>(doc);
      expect(ydoc).toBeInstanceOf(Y.Doc);
    });
  });

  describe("factory methods", () => {
    it("createMap returns a Y.Map", () => {
      expect(adapter.createMap()).toBeInstanceOf(Y.Map);
    });

    it("createArray returns a Y.Array", () => {
      expect(adapter.createArray()).toBeInstanceOf(Y.Array);
    });

    it("createText returns a Y.Text", () => {
      expect(adapter.createText()).toBeInstanceOf(Y.Text);
    });
  });
});
