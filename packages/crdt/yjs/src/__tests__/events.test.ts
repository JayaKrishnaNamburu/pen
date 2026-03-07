import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter.js";
import { createYjsDocument, initBlockMap } from "../document.js";
import { createObserver } from "../events.js";
import type { YjsCRDTDocument } from "../document.js";

function createTestDoc(): YjsCRDTDocument {
  const adapter = yjsAdapter();
  return createYjsDocument(adapter);
}

describe("events", () => {
  describe("createObserver", () => {
    it("fires with affectedBlocks when a block is inserted", () => {
      const doc = createTestDoc();
      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "paragraph", "inline");
      });

      expect(events).toHaveLength(1);
      const event = events[0] as { affectedBlocks: string[] };
      expect(event.affectedBlocks).toContain("block-1");
    });

    it("produces insert-text op with correct offset for text insertion into existing content", () => {
      const doc = createTestDoc();
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "paragraph", "inline");
        doc.penDocument.blockOrder.push(["block-1"]);
      });

      const block = doc.penDocument.blocks.get("block-1")!;
      const ytext = block.get("content") as Y.Text;
      doc.ydoc.transact(() => {
        ytext.insert(0, "Hello ");
      });

      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      doc.ydoc.transact(() => {
        ytext.insert(6, "World");
      });

      expect(events).toHaveLength(1);
      const event = events[0] as { ops: Array<{ type: string; offset?: number; text?: string }> };
      const textOps = event.ops.filter((o) => o.type === "insert-text");
      expect(textOps).toHaveLength(1);
      expect(textOps[0].offset).toBe(6);
      expect(textOps[0].text).toBe("World");
    });

    it("produces update-block op when props change", () => {
      const doc = createTestDoc();
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "heading", "inline");
        doc.penDocument.blockOrder.push(["block-1"]);
      });

      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      const block = doc.penDocument.blocks.get("block-1")!;
      const props = block.get("props") as Y.Map<unknown>;
      doc.ydoc.transact(() => {
        props.set("level", 2);
      });

      expect(events).toHaveLength(1);
      const event = events[0] as { ops: Array<{ type: string; blockId?: string; props?: Record<string, unknown> }> };
      const updateOps = event.ops.filter((o) => o.type === "update-block");
      expect(updateOps).toHaveLength(1);
      expect(updateOps[0].blockId).toBe("block-1");
      expect(updateOps[0].props).toEqual({ level: 2 });
    });

    it("produces delete-block op when block is deleted", () => {
      const doc = createTestDoc();
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "paragraph", "inline");
        doc.penDocument.blockOrder.push(["block-1"]);
      });

      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      doc.ydoc.transact(() => {
        doc.penDocument.blocks.delete("block-1");
      });

      expect(events).toHaveLength(1);
      const event = events[0] as { ops: Array<{ type: string; blockId?: string }> };
      const deleteOps = event.ops.filter((o) => o.type === "delete-block");
      expect(deleteOps).toHaveLength(1);
      expect(deleteOps[0].blockId).toBe("block-1");
    });

    it("maps origin 'ai' correctly", () => {
      const doc = createTestDoc();
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "paragraph", "inline");
      });

      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      const block = doc.penDocument.blocks.get("block-1")!;
      const ytext = block.get("content") as Y.Text;
      doc.ydoc.transact(() => {
        ytext.insert(0, "AI text");
      }, "ai");

      expect(events).toHaveLength(1);
      expect((events[0] as { origin: string }).origin).toBe("ai");
    });

    it("maps null/undefined origin to 'user'", () => {
      const doc = createTestDoc();
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "paragraph", "inline");
      });

      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      const block = doc.penDocument.blocks.get("block-1")!;
      const ytext = block.get("content") as Y.Text;
      doc.ydoc.transact(() => {
        ytext.insert(0, "text");
      });

      expect(events).toHaveLength(1);
      expect((events[0] as { origin: string }).origin).toBe("user");
    });

    it("maps unknown string origin to 'extension'", () => {
      const doc = createTestDoc();
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "paragraph", "inline");
      });

      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      const block = doc.penDocument.blocks.get("block-1")!;
      const ytext = block.get("content") as Y.Text;
      doc.ydoc.transact(() => {
        ytext.insert(0, "text");
      }, "some-unknown-origin");

      expect(events).toHaveLength(1);
      expect((events[0] as { origin: string }).origin).toBe("extension");
    });

    it("does not fire for empty transactions", () => {
      const doc = createTestDoc();
      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      doc.ydoc.transact(() => {
        // no mutations
      });

      expect(events).toHaveLength(0);
    });

    it("resolves nested Y.Text changes to the containing block", () => {
      const doc = createTestDoc();
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "table-1", "table", "table");
        doc.penDocument.blockOrder.push(["table-1"]);
      });

      const tableBlock = doc.penDocument.blocks.get("table-1")!;
      const tableContent = tableBlock.get("tableContent") as Y.Array<Y.Map<unknown>>;

      doc.ydoc.transact(() => {
        const row = new Y.Map<unknown>();
        row.set("id", "row-1");
        const cells = new Y.Array<Y.Map<unknown>>();
        const cell = new Y.Map<unknown>();
        cell.set("id", "cell-1");
        cell.set("content", new Y.Text());
        cells.push([cell]);
        row.set("cells", cells);
        tableContent.push([row]);
      });

      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      const row = tableContent.get(0);
      const cells = row.get("cells") as Y.Array<Y.Map<unknown>>;
      const cell = cells.get(0);
      const cellContent = cell.get("content") as Y.Text;
      doc.ydoc.transact(() => {
        cellContent.insert(0, "Cell text");
      });

      expect(events).toHaveLength(1);
      const event = events[0] as { affectedBlocks: string[] };
      expect(event.affectedBlocks).toContain("table-1");
    });

    it("produces delete-text op", () => {
      const doc = createTestDoc();
      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "paragraph", "inline");
        doc.penDocument.blockOrder.push(["block-1"]);
      });

      const block = doc.penDocument.blocks.get("block-1")!;
      const ytext = block.get("content") as Y.Text;
      doc.ydoc.transact(() => {
        ytext.insert(0, "Hello World");
      });

      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      doc.ydoc.transact(() => {
        ytext.delete(5, 6);
      });

      expect(events).toHaveLength(1);
      const event = events[0] as { ops: Array<{ type: string; offset?: number; length?: number }> };
      const deleteOps = event.ops.filter((o) => o.type === "delete-text");
      expect(deleteOps).toHaveLength(1);
      expect(deleteOps[0].offset).toBe(5);
      expect(deleteOps[0].length).toBe(6);
    });

    it("produces app ops for create-app and delete-app", () => {
      const doc = createTestDoc();
      const events: unknown[] = [];
      createObserver(doc, (e) => events.push(e));

      doc.ydoc.transact(() => {
        const appMap = new Y.Map<unknown>();
        appMap.set("type", "chart");
        doc.penDocument.apps.set("app-1", appMap as Y.Map<unknown>);
      });

      expect(events).toHaveLength(1);
      const createEvent = events[0] as { ops: Array<{ type: string; appId?: string }>; affectedBlocks: string[] };
      const createOps = createEvent.ops.filter((o) => o.type === "create-app");
      expect(createOps).toHaveLength(1);
      expect(createOps[0].appId).toBe("app-1");
      expect(createEvent.affectedBlocks).not.toContain("app-1");

      events.length = 0;
      doc.ydoc.transact(() => {
        doc.penDocument.apps.delete("app-1");
      });

      expect(events).toHaveLength(1);
      const deleteEvent = events[0] as { ops: Array<{ type: string; appId?: string }> };
      const deleteOps = deleteEvent.ops.filter((o) => o.type === "delete-app");
      expect(deleteOps).toHaveLength(1);
      expect(deleteOps[0].appId).toBe("app-1");
    });

    it("returns an unsubscribe function that stops events", () => {
      const doc = createTestDoc();
      const events: unknown[] = [];
      const unsub = createObserver(doc, (e) => events.push(e));

      unsub();

      doc.ydoc.transact(() => {
        initBlockMap(doc.penDocument.blocks, "block-1", "paragraph", "inline");
      });

      expect(events).toHaveLength(0);
    });
  });
});
