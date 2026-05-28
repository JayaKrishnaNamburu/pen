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
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "b1", "paragraph", "inline");
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
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "b1", "paragraph", "inline");
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
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "b1", "paragraph", "inline");
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
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "b1", "paragraph", "inline");
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
        (d: DeltaWithAttributes) => d.attributes?.["suggestion"] !== undefined,
      );
      expect(marked).toBeDefined();
      expect(marked.attributes.suggestion.action).toBe("insert");
    });

    it("is idempotent", () => {
      const ydoc = new Y.Doc();
      const adapter = yjsAdapter();
      const blockOrder = ydoc.getArray<string>("blockOrder");
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "b1", "paragraph", "inline");
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
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "h1", "heading", "inline");
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
      const blocksMap = ydoc.getMap("blocks") as YBlocksMap;
      ydoc.getMap("apps");
      ydoc.getMap("metadata");

      ydoc.transact(() => {
        initBlockMap(blocksMap, "h1", "heading", "inline");
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
});
