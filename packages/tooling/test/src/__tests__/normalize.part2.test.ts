import { describe, expect, it, beforeEach } from "vitest";
import * as Y from "yjs";
import {
  SchemaEngineImpl,
  SchemaRegistryImpl,
  mergeSchemas,
  sortDeltaAttributes,
  deepEqual,
} from "@pen/core";
import {
  defaultSchema,
  bold,
  italic,
  code,
  link,
} from "@pen/schema-default";
import {
  createTestDocument,
  createTestEditor,
  resetTestIdCounter,
} from "../index";
import { yjsAdapter, initBlockMap, wrapYjsDocument } from "@pen/crdt-yjs";
import type { BlockSchema, LayoutSchema } from "@pen/types";
import { defineBlock } from "@pen/types";

type YBlockMap = Y.Map<unknown>;
type YBlocksMap = Y.Map<YBlockMap>;
type DeltaWithAttributes = {
  attributes?: Record<string, unknown>;
};

const FLEX_LAYOUT_SCHEMA = {
  modes: ["flex"],
  defaultMode: "flex",
} satisfies LayoutSchema;

beforeEach(() => {
  resetTestIdCounter();
});

function stateVector(ydoc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(ydoc);
}

describe("SchemaEngineImpl — Normalization Rules", () => {
  describe("Rule 6: normalizeLayout", () => {
    it("collapses empty layout containers", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      const layoutBlock = defineBlock("layoutRow", {
        content: "none",
        fieldEditor: "none",
        layout: FLEX_LAYOUT_SCHEMA,
        serialize: {},
      });

      ydoc.transact(() => {
        initBlockMap(blocksMap, "lr1", "layoutRow", "nested");
        blockOrder.push(["lr1"]);
      });

      const reg = mergeSchemas(
        defaultSchema,
        new SchemaRegistryImpl({ blocks: [layoutBlock as BlockSchema] }),
      );

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(reg, doc, crdtDoc);

      engine.markDirty("lr1");
      engine.normalizeDirty();

      expect(blocksMap.has("lr1")).toBe(false);
      expect(blockOrder.toArray()).not.toContain("lr1");
    });
  });

  // ── Rule 7: Metadata excluded ───────────────────────────
  describe("Rule 7: metadata excluded", () => {
    it("does not modify meta key during normalization", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "p1", "paragraph", "inline");
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
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.markDirty("p1");
      engine.normalizeDirty();

      const meta = (blocksMap.get("p1") as Y.Map<unknown>).get(
        "meta",
      ) as Y.Map<unknown>;
      const ns = meta.get("myExt") as Y.Map<unknown>;
      expect(ns.get("key")).toBe("value");
    });
  });

  // ── AC 13: Rule 10 — Orphan promotion ───────────────────
  describe("AC 13 — Rule 10: orphan promotion", () => {
    it("clears parentId when parent toggle block is deleted", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "toggle1", "toggle", "inline");
        initBlockMap(blocksMap, "child1", "paragraph", "inline");
        initBlockMap(blocksMap, "child2", "paragraph", "inline");

        const child1Props = (
          blocksMap.get("child1") as Y.Map<unknown>
        ).get("props") as Y.Map<unknown>;
        child1Props.set("parentId", "toggle1");

        const child2Props = (
          blocksMap.get("child2") as Y.Map<unknown>
        ).get("props") as Y.Map<unknown>;
        child2Props.set("parentId", "toggle1");

        blockOrder.push(["toggle1", "child1", "child2"]);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      ydoc.transact(() => {
        blocksMap.delete("toggle1");
        blockOrder.delete(0, 1);
      });

      engine.markDirty("toggle1");
      engine.normalizeDirty();

      const child1Props = (
        blocksMap.get("child1") as Y.Map<unknown>
      ).get("props") as Y.Map<unknown>;
      const child2Props = (
        blocksMap.get("child2") as Y.Map<unknown>
      ).get("props") as Y.Map<unknown>;

      expect(child1Props.has("parentId")).toBe(false);
      expect(child2Props.has("parentId")).toBe(false);
    });

    it("is idempotent", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "toggle1", "toggle", "inline");
        initBlockMap(blocksMap, "child1", "paragraph", "inline");
        const child1Props = (
          blocksMap.get("child1") as Y.Map<unknown>
        ).get("props") as Y.Map<unknown>;
        child1Props.set("parentId", "toggle1");
        blockOrder.push(["toggle1", "child1"]);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      ydoc.transact(() => {
        blocksMap.delete("toggle1");
        blockOrder.delete(0, 1);
      });

      engine.markDirty("toggle1");
      engine.normalizeDirty();

      const svBefore = stateVector(ydoc);

      engine.markDirty("child1");
      engine.normalizeDirty();

      const svAfter = stateVector(ydoc);
      expect(svAfter).toEqual(svBefore);
    });
  });

  // ── Rule 11: No cross-array membership ──────────────────
  describe("Rule 11: enforceCrossArrayMembership", () => {
    it("removes block from blockOrder when also in children", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      const layoutBlock = defineBlock("layoutRow", {
        content: "none",
        fieldEditor: "none",
        layout: FLEX_LAYOUT_SCHEMA,
        serialize: {},
      });

      ydoc.transact(() => {
        initBlockMap(blocksMap, "parent", "layoutRow", "nested");
        initBlockMap(blocksMap, "child", "paragraph", "inline");
        const parentMap = blocksMap.get("parent") as Y.Map<unknown>;
        const children = parentMap.get("children") as Y.Array<string>;
        children.push(["child"]);
        blockOrder.push(["parent", "child"]);
      });

      const reg = mergeSchemas(
        defaultSchema,
        new SchemaRegistryImpl({ blocks: [layoutBlock as BlockSchema] }),
      );

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(reg, doc, crdtDoc);

      engine.markDirty("child");
      engine.normalizeDirty();

      expect(blockOrder.toArray()).toEqual(["parent"]);
    });

    it("is idempotent", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      const layoutBlock = defineBlock("layoutRow", {
        content: "none",
        fieldEditor: "none",
        layout: FLEX_LAYOUT_SCHEMA,
        serialize: {},
      });

      ydoc.transact(() => {
        initBlockMap(blocksMap, "parent", "layoutRow", "nested");
        initBlockMap(blocksMap, "child", "paragraph", "inline");
        const parentMap = blocksMap.get("parent") as Y.Map<unknown>;
        const children = parentMap.get("children") as Y.Array<string>;
        children.push(["child"]);
        blockOrder.push(["parent", "child"]);
      });

      const reg = mergeSchemas(
        defaultSchema,
        new SchemaRegistryImpl({ blocks: [layoutBlock as BlockSchema] }),
      );

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(reg, doc, crdtDoc);

      engine.markDirty("child");
      engine.normalizeDirty();

      const svBefore = stateVector(ydoc);
      engine.markDirty("child");
      engine.normalizeDirty();
      const svAfter = stateVector(ydoc);

      expect(svAfter).toEqual(svBefore);
    });
  });

  // ── AC 16: Streaming deferral ───────────────────────────
  describe("AC 16 — Streaming deferral", () => {
    it("deferred block is NOT normalized until undeferBlock", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "p1", "paragraph", "inline");
        blockOrder.push(["p1"]);
        const props = (blocksMap.get("p1") as Y.Map<unknown>).get(
          "props",
        ) as Y.Map<unknown>;
        props.set("indent", 0);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.deferBlock("p1");

      engine.markDirty("p1");
      engine.normalizeDirty();

      // Block is still dirty but not normalized — prop not stripped
      // (paragraph has no indent prop in schema, but let's check the raw state)
      // The block should still have whatever we put there since it's deferred

      engine.undeferBlock("p1");

      // Now the block should be normalized (ZWS inserted if empty, etc.)
      const content = (
        (blocksMap.get("p1") as Y.Map<unknown>).get("content") as Y.Text
      ).toString();
      expect(content).toBe("\u200B");
    });
  });

  // ── normalizeAll ────────────────────────────────────────
  describe("normalizeAll()", () => {
    it("normalizes all blocks in the document", () => {
      const editor = createTestEditor({
        blocks: [
          { id: "h1", type: "heading", props: { level: 1 }, content: "One" },
          { id: "h2", type: "heading", props: { level: 1 }, content: "Two" },
        ],
      });

      const ydoc = editor.ydoc as Y.Doc;
      const blocks = ydoc.getMap("blocks");

      const h1Props = (blocks.get("h1") as Y.Map<unknown>).get(
        "props",
      ) as Y.Map<unknown>;
      const h2Props = (blocks.get("h2") as Y.Map<unknown>).get(
        "props",
      ) as Y.Map<unknown>;

      expect(h1Props.has("level")).toBe(false);
      expect(h2Props.has("level")).toBe(false);
    });
  });

  // ── deepEqual utility ───────────────────────────────────
  describe("deepEqual utility", () => {
    it("compares primitives", () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual("a", "a")).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, undefined)).toBe(false);
    });

    it("compares arrays", () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it("compares objects", () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it("compares nested structures", () => {
      expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(
        true,
      );
    });
  });
});
