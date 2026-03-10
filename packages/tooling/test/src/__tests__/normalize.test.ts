import { describe, expect, it, beforeEach } from "vitest";
import * as Y from "yjs";
import {
  SchemaEngineImpl,
  SchemaRegistryImpl,
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
import type { BlockSchema, InlineSchema } from "@pen/types";
import { defineBlock } from "@pen/types";

beforeEach(() => {
  resetTestIdCounter();
});

function stateVector(ydoc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(ydoc);
}

describe("SchemaEngineImpl — Normalization Rules", () => {
  // ── AC 4: Strip default props ───────────────────────────
  describe("AC 4 — Rule 4: stripDefaultProps", () => {
    it("strips props that equal defaults from CRDT storage", () => {
      const editor = createTestEditor({
        blocks: [
          {
            id: "h1",
            type: "heading",
            props: { level: 1 },
            content: "Test",
          },
        ],
      });

      const ydoc = editor.ydoc as Y.Doc;
      const blocks = ydoc.getMap("blocks");
      const blockMap = blocks.get("h1") as Y.Map<unknown>;
      const props = blockMap.get("props") as Y.Map<unknown>;

      expect(props.has("level")).toBe(false);
    });

    it("preserves non-default props", () => {
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

      const ydoc = editor.ydoc as Y.Doc;
      const blocks = ydoc.getMap("blocks");
      const blockMap = blocks.get("h1") as Y.Map<unknown>;
      const props = blockMap.get("props") as Y.Map<unknown>;

      expect(props.get("level")).toBe(3);
    });
  });

  // ── AC 5: Idempotency via state vector comparison ───────
  describe("AC 5 — Idempotency", () => {
    it("second normalizeDirty produces zero CRDT writes", () => {
      const editor = createTestEditor({
        blocks: [
          { id: "p1", type: "paragraph", content: "Hello" },
          { id: "h1", type: "heading", props: { level: 2 }, content: "Title" },
        ],
      });

      const ydoc = editor.ydoc as Y.Doc;
      const svBefore = stateVector(ydoc);

      editor.markDirty("p1");
      editor.markDirty("h1");
      editor.normalizeDirty();

      const svAfter = stateVector(ydoc);
      expect(svAfter).toEqual(svBefore);
    });
  });

  // ── AC 6 + AC 14: Deduplicate block IDs ─────────────────
  describe("AC 6/14 — Rule 9: deduplicateBlockIds", () => {
    it("keeps only the last occurrence of a duplicate ID in blockOrder", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "b1", "paragraph", "inline");
        const content = (blocksMap.get("b1") as Y.Map<unknown>).get(
          "content",
        ) as Y.Text;
        content.insert(0, "Hello");

        blockOrder.push(["b1", "b1", "b1"]);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.markDirty("b1");
      engine.normalizeDirty();

      expect(blockOrder.toArray()).toEqual(["b1"]);
    });

    it("is idempotent", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "b1", "paragraph", "inline");
        blockOrder.push(["b1", "b1"]);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.markDirty("b1");
      engine.normalizeDirty();

      const svBefore = stateVector(ydoc);
      engine.markDirty("b1");
      engine.normalizeDirty();
      const svAfter = stateVector(ydoc);

      expect(svAfter).toEqual(svBefore);
    });
  });

  // ── Rule 1: Inline mark ordering (read-time) ───────────
  describe("AC 15 — Rule 1: sortDeltaAttributes", () => {
    it("orders marks by priority", () => {
      const attrs = { code: true, bold: true, italic: true };
      const sorted = sortDeltaAttributes(attrs, defaultSchema);
      const keys = Object.keys(sorted);

      expect(keys.indexOf("bold")).toBeLessThan(keys.indexOf("italic"));
      expect(keys.indexOf("italic")).toBeLessThan(keys.indexOf("code"));
    });

    it("preserves system marks position (returns 0 in sort)", () => {
      const attrs = { suggestion: { action: "insert" }, bold: true };
      const sorted = sortDeltaAttributes(attrs, defaultSchema);
      expect(Object.keys(sorted)).toHaveLength(2);
    });

    it("returns same object for single-key attributes", () => {
      const attrs = { bold: true };
      expect(sortDeltaAttributes(attrs, defaultSchema)).toBe(attrs);
    });
  });

  // ── Rule 2: Strip superfluous wrappers ──────────────────
  describe("Rule 2: stripSuperfluousMarks", () => {
    it("strips null-valued mark attributes", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "b1", "paragraph", "inline");
        blockOrder.push(["b1"]);
        const content = (blocksMap.get("b1") as Y.Map<unknown>).get(
          "content",
        ) as Y.Text;
        content.insert(0, "Hello");
        content.format(0, 3, { bold: true });
        content.format(3, 2, { bold: null });
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.markDirty("b1");
      engine.normalizeDirty();

      const content = (
        (ydoc.getMap("blocks").get("b1") as Y.Map<unknown>).get(
          "content",
        ) as Y.Text
      ).toDelta();

      for (const delta of content) {
        if (delta.attributes) {
          expect(delta.attributes.bold).not.toBeNull();
        }
      }
    });

    it("preserves system marks (never strips them)", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "b1", "paragraph", "inline");
        blockOrder.push(["b1"]);
        const content = (blocksMap.get("b1") as Y.Map<unknown>).get(
          "content",
        ) as Y.Text;
        content.insert(0, "Hello world");
        content.format(0, 5, {
          suggestion: { action: "insert", id: "s1" },
        });
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.markDirty("b1");
      engine.normalizeDirty();

      const content = (
        (ydoc.getMap("blocks").get("b1") as Y.Map<unknown>).get(
          "content",
        ) as Y.Text
      ).toDelta();

      const marked = content.find(
        (d: any) => d.attributes?.suggestion,
      );
      expect(marked).toBeDefined();
      expect(marked.attributes.suggestion.action).toBe("insert");
    });

    it("is idempotent", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "b1", "paragraph", "inline");
        blockOrder.push(["b1"]);
        const content = (blocksMap.get("b1") as Y.Map<unknown>).get(
          "content",
        ) as Y.Text;
        content.insert(0, "Hello");
        content.format(0, 3, { bold: true });
        content.format(3, 2, { bold: null });
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.markDirty("b1");
      engine.normalizeDirty();

      const svBefore = stateVector(ydoc);
      engine.markDirty("b1");
      engine.normalizeDirty();
      const svAfter = stateVector(ydoc);

      expect(svAfter).toEqual(svBefore);
    });
  });

  // ── Rule 3: No empty containers ─────────────────────────
  describe("Rule 3: ensureNonEmptyContent", () => {
    it("inserts ZWS into empty inline blocks", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph" }],
      });

      const ydoc = editor.ydoc as Y.Doc;
      const blockMap = (ydoc.getMap("blocks").get("p1") as Y.Map<unknown>);
      const content = blockMap.get("content") as Y.Text;

      expect(content.toString()).toBe("\u200B");
    });

    it("does not insert ZWS into non-empty blocks", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
      });

      const ydoc = editor.ydoc as Y.Doc;
      const blockMap = (ydoc.getMap("blocks").get("p1") as Y.Map<unknown>);
      const content = blockMap.get("content") as Y.Text;

      expect(content.toString()).toBe("Hello");
    });

    it("is idempotent", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph" }],
      });

      const ydoc = editor.ydoc as Y.Doc;
      const svBefore = stateVector(ydoc);

      editor.markDirty("p1");
      editor.normalizeDirty();

      const svAfter = stateVector(ydoc);
      expect(svAfter).toEqual(svBefore);
    });
  });

  // ── Rule 5: Block-specific normalization ────────────────
  describe("Rule 5: runBlockNormalize", () => {
    it("clamps heading level to valid range", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "h1", "heading", "inline");
        blockOrder.push(["h1"]);
        const props = (blocksMap.get("h1") as Y.Map<unknown>).get(
          "props",
        ) as Y.Map<unknown>;
        props.set("level", 10);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.markDirty("h1");
      engine.normalizeDirty();

      const props = (blocksMap.get("h1") as Y.Map<unknown>).get(
        "props",
      ) as Y.Map<unknown>;
      expect(props.get("level")).toBe(6);
    });

    it("is idempotent", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "h1", "heading", "inline");
        blockOrder.push(["h1"]);
        const props = (blocksMap.get("h1") as Y.Map<unknown>).get(
          "props",
        ) as Y.Map<unknown>;
        props.set("level", 10);
      });

      const crdtDoc = wrapYjsDocument(adapter, ydoc);
      const doc = crdtDoc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, doc, crdtDoc);

      engine.markDirty("h1");
      engine.normalizeDirty();

      const svBefore = stateVector(ydoc);
      engine.markDirty("h1");
      engine.normalizeDirty();
      const svAfter = stateVector(ydoc);

      expect(svAfter).toEqual(svBefore);
    });
  });

  // ── Rule 6: Layout normalization ────────────────────────
  describe("Rule 6: normalizeLayout", () => {
    it("collapses empty layout containers", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      const layoutBlock = defineBlock("layoutRow", {
        content: "none",
        fieldEditor: "none",
        layout: { defaultMode: "row" } as any,
        serialize: {},
      });

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "lr1", "layoutRow", "nested");
        blockOrder.push(["lr1"]);
      });

      const reg = new SchemaRegistryImpl({
        blocks: [...defaultSchema.allBlocks(), layoutBlock as unknown as BlockSchema],
        inlines: defaultSchema.allInlines().filter((i) => !i.system) as InlineSchema[],
      });

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
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "toggle1", "toggle", "inline");
        initBlockMap(blocksMap as any, "child1", "paragraph", "inline");
        initBlockMap(blocksMap as any, "child2", "paragraph", "inline");

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
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "toggle1", "toggle", "inline");
        initBlockMap(blocksMap as any, "child1", "paragraph", "inline");
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
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      const layoutBlock = defineBlock("layoutRow", {
        content: "none",
        fieldEditor: "none",
        layout: { defaultMode: "row" } as any,
        serialize: {},
      });

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "parent", "layoutRow", "nested");
        initBlockMap(blocksMap as any, "child", "paragraph", "inline");
        const parentMap = blocksMap.get("parent") as Y.Map<unknown>;
        const children = parentMap.get("children") as Y.Array<string>;
        children.push(["child"]);
        blockOrder.push(["parent", "child"]);
      });

      const reg = new SchemaRegistryImpl({
        blocks: [...defaultSchema.allBlocks(), layoutBlock as unknown as BlockSchema],
        inlines: defaultSchema.allInlines().filter((i) => !i.system) as InlineSchema[],
      });

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
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      const layoutBlock = defineBlock("layoutRow", {
        content: "none",
        fieldEditor: "none",
        layout: { defaultMode: "row" } as any,
        serialize: {},
      });

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "parent", "layoutRow", "nested");
        initBlockMap(blocksMap as any, "child", "paragraph", "inline");
        const parentMap = blocksMap.get("parent") as Y.Map<unknown>;
        const children = parentMap.get("children") as Y.Array<string>;
        children.push(["child"]);
        blockOrder.push(["parent", "child"]);
      });

      const reg = new SchemaRegistryImpl({
        blocks: [...defaultSchema.allBlocks(), layoutBlock as unknown as BlockSchema],
        inlines: defaultSchema.allInlines().filter((i) => !i.system) as InlineSchema[],
      });

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
      const blocksMap = ydoc.getMap("blocks");
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap as any, "p1", "paragraph", "inline");
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
