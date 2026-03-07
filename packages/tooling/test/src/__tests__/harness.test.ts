import { describe, expect, it, beforeEach } from "vitest";
import * as Y from "yjs";
import {
  createTestDocument,
  createTestEditor,
  assertDocEquals,
  createTestCollaboration,
  resetTestIdCounter,
} from "../index.js";

beforeEach(() => {
  resetTestIdCounter();
});

describe("@pen/test harness", () => {
  // ── AC 9: createTestDocument ────────────────────────────
  describe("AC 9 — createTestDocument", () => {
    it("produces a valid CRDT document with one heading block", () => {
      resetTestIdCounter();
      const { ydoc, doc } = createTestDocument([
        { type: "heading", props: { level: 1 }, content: "Hello" },
      ]);

      expect(ydoc).toBeInstanceOf(Y.Doc);

      const blockOrder = ydoc.getArray<string>("blockOrder");
      expect(blockOrder.length).toBe(1);

      const blockId = blockOrder.get(0);
      const blocks = ydoc.getMap("blocks");
      const blockMap = blocks.get(blockId) as Y.Map<unknown>;

      expect(blockMap.get("type")).toBe("heading");
      const props = blockMap.get("props") as Y.Map<unknown>;
      expect(props.get("level")).toBe(1);
      const content = blockMap.get("content") as Y.Text;
      expect(content.toString()).toBe("Hello");
    });

    it("creates multiple blocks", () => {
      const { ydoc } = createTestDocument([
        { type: "paragraph", content: "First" },
        { type: "paragraph", content: "Second" },
        { type: "heading", props: { level: 2 }, content: "Title" },
      ]);

      expect(ydoc.getArray("blockOrder").length).toBe(3);
    });

    it("creates blocks with custom IDs", () => {
      const { ydoc } = createTestDocument([
        { id: "my-id", type: "paragraph", content: "Test" },
      ]);

      expect(ydoc.getArray("blockOrder").get(0)).toBe("my-id");
    });

    it("creates image blocks without content", () => {
      const { ydoc } = createTestDocument([
        { id: "img1", type: "image", props: { src: "test.png" } },
      ]);

      const blockMap = ydoc.getMap("blocks").get("img1") as Y.Map<unknown>;
      expect(blockMap.has("content")).toBe(false);
    });

    it("creates blocks with children (layout)", () => {
      const { ydoc } = createTestDocument([
        {
          id: "parent",
          type: "layoutRow",
          children: [
            { id: "child1", type: "paragraph", content: "A" },
            { id: "child2", type: "paragraph", content: "B" },
          ],
        },
      ]);

      const blockMap = ydoc.getMap("blocks").get("parent") as Y.Map<unknown>;
      const children = blockMap.get("children") as Y.Array<string>;
      expect(children.toArray()).toEqual(["child1", "child2"]);
    });
  });

  // ── AC 10: assertDocEquals ──────────────────────────────
  describe("AC 10 — assertDocEquals", () => {
    it("passes for matching documents", () => {
      const editor = createTestEditor({
        blocks: [
          { id: "p1", type: "paragraph", content: "Hello" },
          { id: "h1", type: "heading", props: { level: 2 }, content: "Title" },
        ],
      });

      expect(() =>
        assertDocEquals(editor, [
          { type: "paragraph", content: "Hello" },
          { type: "heading", props: { level: 2 }, content: "Title" },
        ]),
      ).not.toThrow();
    });

    it("throws for type mismatch", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
      });

      expect(() =>
        assertDocEquals(editor, [{ type: "heading", content: "Hello" }]),
      ).toThrow("type mismatch");
    });

    it("throws for content mismatch", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
      });

      expect(() =>
        assertDocEquals(editor, [{ type: "paragraph", content: "World" }]),
      ).toThrow("content mismatch");
    });

    it("throws for prop mismatch", () => {
      const editor = createTestEditor({
        blocks: [
          {
            id: "h1",
            type: "heading",
            props: { level: 3 },
            content: "Title",
          },
        ],
      });

      expect(() =>
        assertDocEquals(editor, [
          { type: "heading", props: { level: 2 }, content: "Title" },
        ]),
      ).toThrow('prop "level" mismatch');
    });

    it("throws for document length mismatch", () => {
      const editor = createTestEditor({
        blocks: [
          { id: "p1", type: "paragraph", content: "A" },
          { id: "p2", type: "paragraph", content: "B" },
        ],
      });

      expect(() =>
        assertDocEquals(editor, [{ type: "paragraph", content: "A" }]),
      ).toThrow("Document length mismatch");
    });

    it("compares two editors", () => {
      const editorA = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Same" }],
      });
      resetTestIdCounter();
      const editorB = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Same" }],
      });

      expect(() => assertDocEquals(editorA, editorB)).not.toThrow();
    });
  });

  // ── AC 21: round-trip ───────────────────────────────────
  describe("AC 21 — createTestDocument + assertDocEquals round-trip", () => {
    it("create doc, assert equals expected, passes", () => {
      const blocks = [
        { type: "paragraph", content: "Hello" },
        { type: "heading", props: { level: 2 }, content: "Title" },
      ];

      const editor = createTestEditor({ blocks });

      expect(() => assertDocEquals(editor, blocks)).not.toThrow();
    });
  });

  describe("Wave 3 test input helpers", () => {
    it("simulateTyping inserts text into the current text selection", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
      });

      editor.selectText("p1", 5, 5);
      editor.simulateTyping(" world");

      expect(editor.getBlock("p1").textContent()).toBe("Hello world");
    });

    it("simulateKeypress supports mark shortcuts on a text selection", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
      });

      editor.selectText("p1", 0, 5);
      editor.simulateKeypress("Mod-b");

      expect(editor.getBlock("p1").textDeltas()).toEqual([
        {
          insert: "Hello",
          attributes: { bold: true },
        },
      ]);
    });

    it("simulateKeypress supports Enter by splitting the block", () => {
      const editor = createTestEditor({
        blocks: [{ id: "p1", type: "paragraph", content: "HelloWorld" }],
      });

      editor.selectText("p1", 5, 5);
      editor.simulateKeypress("Enter");

      expect(editor.document.blockOrder.length).toBe(2);
      expect(editor.getBlock("p1").textContent()).toBe("Hello");

      const nextBlockId = editor.document.blockOrder.get(1);
      expect(editor.getBlock(nextBlockId).textContent()).toBe("World");
    });
  });

  // ── AC 22: collaboration sync ───────────────────────────
  describe("AC 22 — createTestCollaboration sync", () => {
    it("concurrent edits converge after sync", () => {
      const collab = createTestCollaboration({
        blocks: [
          { id: "p1", type: "paragraph", content: "Hello" },
        ],
      });

      const ydocA = collab.editorA.ydoc as Y.Doc;
      const ydocB = collab.editorB.ydoc as Y.Doc;

      ydocA.transact(() => {
        const blocks = ydocA.getMap("blocks");
        const blockMap = blocks.get("p1") as Y.Map<unknown>;
        const content = blockMap.get("content") as Y.Text;
        content.insert(5, " A");
      });

      ydocB.transact(() => {
        const blocks = ydocB.getMap("blocks");
        const blockMap = blocks.get("p1") as Y.Map<unknown>;
        const content = blockMap.get("content") as Y.Text;
        content.insert(5, " B");
      });

      collab.sync();

      assertDocEquals(collab.editorA, collab.editorB);
    });
  });
});
