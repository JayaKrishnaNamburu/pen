import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  APPS,
  BLOCKS,
  BLOCK_ORDER,
  METADATA,
  createYjsDocument,
  initBlockMap,
  isYjsCRDTDocument,
  wrapYjsDocument,
} from "../document.js";
import { yjsAdapter } from "../adapter.js";

describe("document", () => {
  const adapter = yjsAdapter();

  describe("createYjsDocument", () => {
    it("creates a document with all four shared types", () => {
      const doc = createYjsDocument(adapter);
      expect(doc.ydoc).toBeInstanceOf(Y.Doc);
      expect(doc.penDocument.blockOrder).toBeInstanceOf(Y.Array);
      expect(doc.penDocument.blocks).toBeInstanceOf(Y.Map);
      expect(doc.penDocument.apps).toBeInstanceOf(Y.Map);
      expect(doc.penDocument.metadata).toBeInstanceOf(Y.Map);
      expect(doc.adapter).toBe(adapter);
    });

    it("defaults gc to true", () => {
      const doc = createYjsDocument(adapter);
      expect(doc.ydoc.gc).toBe(true);
    });

    it("respects gc: false option", () => {
      const doc = createYjsDocument(adapter, { gc: false });
      expect(doc.ydoc.gc).toBe(false);
    });
  });

  describe("wrapYjsDocument", () => {
    it("wraps an existing Y.Doc", () => {
      const ydoc = new Y.Doc();
      ydoc.getArray(BLOCK_ORDER);
      ydoc.getMap(BLOCKS);
      ydoc.getMap(APPS);
      ydoc.getMap(METADATA);

      const doc = wrapYjsDocument(adapter, ydoc);
      expect(doc.ydoc).toBe(ydoc);
      expect(doc.penDocument.blockOrder).toBeInstanceOf(Y.Array);
      expect(doc.penDocument.blocks).toBeInstanceOf(Y.Map);
    });
  });

  describe("initBlockMap", () => {
    it("creates inline block with Y.Text content", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
      });

      const block = doc.penDocument.blocks.get("b1")!;
      expect(block.get("type")).toBe("paragraph");
      expect(block.get("props")).toBeInstanceOf(Y.Map);
      expect(block.get("content")).toBeInstanceOf(Y.Text);
      expect(block.get("meta")).toBeInstanceOf(Y.Map);
      expect(block.has("children")).toBe(false);
      expect(block.has("tableContent")).toBe(false);
    });

    it("creates table block with Y.Array tableContent", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "b2", "table", "table");
      });

      const block = doc.penDocument.blocks.get("b2")!;
      expect(block.get("type")).toBe("table");
      expect(block.get("tableContent")).toBeInstanceOf(Y.Array);
      expect(block.has("content")).toBe(false);
      expect(block.has("children")).toBe(false);
    });

    it("creates nested block with Y.Array children", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "b3", "section", "nested");
      });

      const block = doc.penDocument.blocks.get("b3")!;
      expect(block.get("children")).toBeInstanceOf(Y.Array);
      expect(block.has("content")).toBe(false);
      expect(block.has("tableContent")).toBe(false);
    });

    it("creates block with content type 'none'", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "b4", "divider", "none");
      });

      const block = doc.penDocument.blocks.get("b4")!;
      expect(block.get("type")).toBe("divider");
      expect(block.get("props")).toBeInstanceOf(Y.Map);
      expect(block.get("meta")).toBeInstanceOf(Y.Map);
      expect(block.has("content")).toBe(false);
      expect(block.has("children")).toBe(false);
      expect(block.has("tableContent")).toBe(false);
    });

    it("defaults content type to inline", () => {
      const doc = createYjsDocument(adapter);
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "b5", "paragraph");
      });

      const block = doc.penDocument.blocks.get("b5")!;
      expect(block.get("content")).toBeInstanceOf(Y.Text);
    });
  });

  describe("isYjsCRDTDocument", () => {
    it("returns true for adapter-created docs", () => {
      const doc = createYjsDocument(adapter);
      expect(isYjsCRDTDocument(doc)).toBe(true);
    });

    it("returns false for plain objects", () => {
      expect(isYjsCRDTDocument({})).toBe(false);
      expect(isYjsCRDTDocument(null)).toBe(false);
      expect(isYjsCRDTDocument({ ydoc: "not a doc" })).toBe(false);
    });
  });

  describe("constants", () => {
    it("exports correct shared type key names", () => {
      expect(BLOCK_ORDER).toBe("blockOrder");
      expect(BLOCKS).toBe("blocks");
      expect(APPS).toBe("apps");
      expect(METADATA).toBe("metadata");
    });
  });
});
