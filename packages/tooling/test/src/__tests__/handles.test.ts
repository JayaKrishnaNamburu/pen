import { describe, expect, it, beforeEach } from "vitest";
import * as Y from "yjs";
import { createBlockHandle, createAppHandle } from "@pen/core";
import { defaultSchema } from "@pen/schema-default";
import {
  createTestDocument,
  createTestEditor,
  resetTestIdCounter,
} from "../index";
import { yjsAdapter, initBlockMap, wrapYjsDocument } from "@pen/crdt-yjs";

beforeEach(() => {
  resetTestIdCounter();
});

describe("BlockHandle", () => {
  // ── AC 7: textContent ───────────────────────────────────
  describe("AC 7 — textContent()", () => {
    it("returns the full text of an inline block", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Hello world" }],
      });
      const handle = editor.getBlock("p1");
      expect(handle.textContent()).toBe("Hello world");
    });

    it("returns empty string for ZWS-only content", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph" }],
      });
      const handle = editor.getBlock("p1");
      expect(handle.textContent()).toBe("");
    });

    it("returns empty string for non-inline blocks", () => {
      const editor = createTestEditor({
        blocks: [{ id: "img1", type: "image", props: { src: "test.png" } }],
      });
      const handle = editor.getBlock("img1");
      expect(handle.textContent()).toBe("");
    });

    it("returns resolved text (strips deleted suggestions)", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "p1", "paragraph", "inline");
        blockOrder.push(["p1"]);
        const content = (blocksMap.get("p1") as Y.Map<unknown>).get(
          "content",
        ) as Y.Text;
        content.insert(0, "Hello world");
        content.format(6, 5, {
          suggestion: { action: "delete", id: "s1" },
        });
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const handle = createBlockHandle("p1", doc, crdtDoc, defaultSchema);
      expect(handle.textContent({ resolved: true })).toBe("Hello ");
    });
  });

  // ── AC 8: prev / next ──────────────────────────────────
  describe("AC 8 — prev / next navigation", () => {
    it("navigates forward correctly", () => {
      const editor = createTestEditor({
        blocks: [
          { id: "a", type: "paragraph", content: "A" },
          { id: "b", type: "paragraph", content: "B" },
          { id: "c", type: "paragraph", content: "C" },
        ],
      });

      const a = editor.getBlock("a");
      expect(a.next?.id).toBe("b");
      expect(a.next?.next?.id).toBe("c");
      expect(a.next?.next?.next).toBeNull();
    });

    it("navigates backward correctly", () => {
      const editor = createTestEditor({
        blocks: [
          { id: "a", type: "paragraph", content: "A" },
          { id: "b", type: "paragraph", content: "B" },
          { id: "c", type: "paragraph", content: "C" },
        ],
      });

      const c = editor.getBlock("c");
      expect(c.prev?.id).toBe("b");
      expect(c.prev?.prev?.id).toBe("a");
      expect(c.prev?.prev?.prev).toBeNull();
    });

    it("returns null for first block's prev", () => {
      const editor = createTestEditor({
        blocks: [{ id: "a", type: "paragraph", content: "A" }],
      });
      expect(editor.getBlock("a").prev).toBeNull();
    });

    it("returns null for last block's next", () => {
      const editor = createTestEditor({
        blocks: [{ id: "a", type: "paragraph", content: "A" }],
      });
      expect(editor.getBlock("a").next).toBeNull();
    });
  });

  // ── Basic properties ────────────────────────────────────
  describe("basic properties", () => {
    it("returns correct id", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Test" }],
      });
      expect(editor.getBlock("p1").id).toBe("p1");
    });

    it("returns correct type", () => {
      const editor = createTestEditor({
        blocks: [{ id: "h1", type: "heading", content: "Test" }],
      });
      expect(editor.getBlock("h1").type).toBe("heading");
    });

    it("returns props with defaults filled in", () => {
      const editor = createTestEditor({
        blocks: [{ id: "h1", type: "heading", content: "Test" }],
      });
      const handle = editor.getBlock("h1");
      expect(handle.props.level).toBe(1);
    });

    it("returns explicit props over defaults", () => {
      const editor = createTestEditor({
        blocks: [
          {
            id: "h1",
            type: "heading",
            props: { level: 3 },
            content: "Test",
          },
        ],
      });
      const handle = editor.getBlock("h1");
      expect(handle.props.level).toBe(3);
    });

    it("returns correct index", () => {
      const editor = createTestEditor({
        blocks: [
          { id: "a", type: "paragraph" },
          { id: "b", type: "paragraph" },
          { id: "c", type: "paragraph" },
        ],
      });
      expect(editor.getBlock("a").index).toBe(0);
      expect(editor.getBlock("b").index).toBe(1);
      expect(editor.getBlock("c").index).toBe(2);
    });
  });

  // ── Parent / children (parentId-based) ──────────────────
  describe("parent / children (parentId-based)", () => {
    it("finds parent via parentId", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "toggle1", "toggle", "inline");
        initBlockMap(blocksMap as any, "child1", "paragraph", "inline");
        const childProps = (blocksMap.get("child1") as Y.Map<unknown>).get(
          "props",
        ) as Y.Map<unknown>;
        childProps.set("parentId", "toggle1");
        blockOrder.push(["toggle1", "child1"]);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;

      const child = createBlockHandle("child1", doc, crdtDoc, defaultSchema);
      expect(child.parent?.id).toBe("toggle1");

      const parent = createBlockHandle("toggle1", doc, crdtDoc, defaultSchema);
      const children = parent.children;
      expect(children).toHaveLength(1);
      expect(children[0].id).toBe("child1");
    });
  });

  // ── Traversal methods ───────────────────────────────────
  describe("traversal", () => {
    it("descendants yields all children recursively", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "toggle1", "toggle", "inline");
        initBlockMap(blocksMap as any, "p1", "paragraph", "inline");
        initBlockMap(blocksMap as any, "p2", "paragraph", "inline");
        const p1Props = (blocksMap.get("p1") as Y.Map<unknown>).get(
          "props",
        ) as Y.Map<unknown>;
        p1Props.set("parentId", "toggle1");
        const p2Props = (blocksMap.get("p2") as Y.Map<unknown>).get(
          "props",
        ) as Y.Map<unknown>;
        p2Props.set("parentId", "toggle1");
        blockOrder.push(["toggle1", "p1", "p2"]);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const toggle = createBlockHandle("toggle1", doc, crdtDoc, defaultSchema);
      const descendants = [...toggle.descendants()];
      expect(descendants).toHaveLength(2);
      expect(descendants.map((d) => d.id)).toEqual(["p1", "p2"]);
    });

    it("ancestors yields parent chain", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "toggle1", "toggle", "inline");
        initBlockMap(blocksMap as any, "child1", "paragraph", "inline");
        const childProps = (blocksMap.get("child1") as Y.Map<unknown>).get(
          "props",
        ) as Y.Map<unknown>;
        childProps.set("parentId", "toggle1");
        blockOrder.push(["toggle1", "child1"]);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const child = createBlockHandle("child1", doc, crdtDoc, defaultSchema);
      const ancestors = [...child.ancestors()];
      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].id).toBe("toggle1");
    });

    it("siblings yields other top-level blocks for root blocks", () => {
      const editor = createTestEditor({
        blocks: [
          { id: "a", type: "paragraph" },
          { id: "b", type: "paragraph" },
          { id: "c", type: "paragraph" },
        ],
      });
      const b = editor.getBlock("b");
      const siblings = [...b.siblings()];
      expect(siblings.map((s) => s.id)).toEqual(["a", "c"]);
    });
  });

  // ── textDeltas ──────────────────────────────────────────
  describe("textDeltas()", () => {
    it("returns deltas with mark attributes", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "p1", "paragraph", "inline");
        blockOrder.push(["p1"]);
        const content = (blocksMap.get("p1") as Y.Map<unknown>).get(
          "content",
        ) as Y.Text;
        content.insert(0, "Hello world");
        content.format(0, 5, { bold: true });
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const handle = createBlockHandle("p1", doc, crdtDoc, defaultSchema);
      const deltas = handle.textDeltas();
      expect(deltas[0].insert).toBe("Hello");
      expect(deltas[0].attributes?.bold).toBe(true);
      expect(deltas[1].insert).toBe(" world");
    });
  });

  // ── length ──────────────────────────────────────────────
  describe("length()", () => {
    it("returns text length", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
      });
      expect(editor.getBlock("p1").length()).toBe(5);
    });
  });

  // ── meta ────────────────────────────────────────────────
  describe("meta()", () => {
    it("returns null when no metadata", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph" }],
      });
      expect(editor.getBlock("p1").meta("nonexistent")).toBeNull();
    });

    it("reads metadata from meta Y.Map", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "p1", "paragraph", "inline");
        blockOrder.push(["p1"]);
        const meta = (blocksMap.get("p1") as Y.Map<unknown>).get(
          "meta",
        ) as Y.Map<unknown>;
        const ns = new Y.Map<unknown>();
        ns.set("key", "value");
        meta.set("myExt", ns);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const handle = createBlockHandle("p1", doc, crdtDoc, defaultSchema);
      const result = handle.meta("myExt");
      expect(result).toEqual({ key: "value" });
    });
  });

  // ── isLayoutChild / layoutParent ────────────────────────
  describe("layout queries", () => {
    it("layout is null for regular blocks", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph" }],
      });
      expect(editor.getBlock("p1").layout).toBeNull();
    });

    it("isLayoutChild is false for top-level blocks", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph" }],
      });
      expect(editor.getBlock("p1").isLayoutChild).toBe(false);
    });
  });

  // ── Block not found ─────────────────────────────────────
  describe("error handling", () => {
    it("throws for non-existent block", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph" }],
      });
      expect(() => editor.getBlock("nonexistent").type).toThrow(
        "Block not found: nonexistent",
      );
    });
  });
});

describe("AppHandle", () => {
  it("reads app properties", () => {
    const ydoc = new Y.Doc();
    const adapter = yjsAdapter();
    const blockOrder = ydoc.getArray<string>("blockOrder");
    const blocksMap = ydoc.getMap("blocks");
    const appsMap = ydoc.getMap("apps");
    ydoc.getMap("metadata");

    ydoc.transact(() => {
      initBlockMap(blocksMap as any, "p1", "paragraph", "inline");
      blockOrder.push(["p1"]);

      const appMap = new Y.Map<unknown>();
      appMap.set("type", "counter");
      appMap.set("placement", { blockId: "p1", position: "after" });
      const config = new Y.Map<unknown>();
      config.set("initial", 0);
      appMap.set("config", config);
      appsMap.set("app1", appMap);
    });

    const crdtDoc = wrapYjsDocument(adapter, ydoc);
    const doc = crdtDoc.penDocument;
    const app = createAppHandle("app1", doc, crdtDoc, defaultSchema);

    expect(app.id).toBe("app1");
    expect(app.type).toBe("counter");
    expect(app.config).toEqual({ initial: 0 });
    expect(app.anchorBlock?.id).toBe("p1");
  });
});
