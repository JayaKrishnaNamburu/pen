import { describe, expect, it } from "vitest";
import { processStream } from "@pen/delta-stream";
import type { PenStreamPart } from "@pen/types";

import { createEditor, defineExtension } from "../index.js";

async function* createStream(parts: PenStreamPart[]) {
  for (const part of parts) {
    yield part;
  }
}

function visibleText(text: string): string {
  return text.replace(/\u200B/g, "");
}

describe("@pen/core createEditor", () => {
  it("creates a working editor with default schema and extensions", () => {
    const editor = createEditor();

    expect(editor.schema.resolve("paragraph")).toBeTruthy();
    expect(typeof editor.clientId).toBe("number");
    expect(editor.internals.getSlot("core:engine")).toBe(
      editor.internals.engine,
    );
    expect(editor.internals.getSlot("document-ops:toolServer")).toBeTruthy();
    expect(editor.internals.getSlot("undo:manager")).toBeTruthy();

    editor.destroy();
  });

  it("starts with a single empty paragraph block in zero-config mode", () => {
    const editor = createEditor();

    expect(editor.blockCount()).toBe(1);
    expect(editor.firstBlock()?.type).toBe("paragraph");
    expect(editor.firstBlock()?.textContent()).toBe("");

    editor.destroy();
  });

  it("applies insert-block and insert-text operations", () => {
    const editor = createEditor({ without: ["document-ops", "delta-stream", "undo"] });

    editor.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
    ]);

    editor.apply([
      {
        type: "insert-text",
        blockId: "b1",
        offset: 0,
        text: "hello",
      },
    ]);

    expect(editor.getBlock("b1")?.textContent()).toBe("hello");

    editor.destroy();
  });

  it("splits and merges inline blocks", () => {
    const editor = createEditor({ without: ["document-ops", "delta-stream", "undo"] });

    editor.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "b1",
        offset: 0,
        text: "hello world",
      },
    ]);

    editor.apply([
      {
        type: "split-block",
        blockId: "b1",
        offset: 5,
        newBlockId: "b2",
      },
    ]);

    expect(editor.getBlock("b1")?.textContent()).toBe("hello");
    expect(editor.getBlock("b2")?.textContent()).toBe(" world");

    editor.apply([
      {
        type: "merge-blocks",
        targetBlockId: "b1",
        sourceBlockId: "b2",
      },
    ]);

    expect(editor.getBlock("b1")?.textContent()).toBe("hello world");
    expect(editor.getBlock("b2")).toBeNull();

    editor.destroy();
  });

  it("queues reentrant apply calls from observe hooks", () => {
    let appended = false;
    const ext = defineExtension({
      name: "append-exclamation",
      observe(events, editor) {
        if (appended) return;
        const hasInsertText = events.some((event) =>
          event.ops.some((op) => op.type === "insert-text"),
        );
        if (!hasInsertText) return;

        appended = true;
        editor.apply(
          [
            {
              type: "insert-text",
              blockId: "b1",
              offset: 5,
              text: "!",
            },
          ],
          { origin: "extension" },
        );
      },
    });

    const editor = createEditor({
      without: ["document-ops", "delta-stream", "undo"],
      extensions: [ext],
    });

    editor.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "b1",
        offset: 0,
        text: "hello",
      },
    ]);

    expect(editor.getBlock("b1")?.textContent()).toBe("hello!");

    editor.destroy();
  });

  it("clamps text selections and returns backwards selected text", () => {
    const editor = createEditor({ without: ["document-ops", "delta-stream", "undo"] });

    editor.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "insert-text",
        blockId: "b1",
        offset: 0,
        text: "hello",
      },
    ]);

    editor.selectText("b1", 10, 99);
    expect(editor.getSelection()).toMatchObject({
      type: "text",
      anchor: { blockId: "b1", offset: 5 },
      focus: { blockId: "b1", offset: 5 },
    });

    editor.setSelection({
      type: "text",
      anchor: { blockId: "b1", offset: 5 },
      focus: { blockId: "b1", offset: 2 },
      isCollapsed: false,
      isMultiBlock: false,
      blockRange: ["b1"],
      toRange: () => {
        throw new Error("test helper");
      },
    });

    expect(editor.getSelectedText()).toBe("llo");

    editor.destroy();
  });

  it("rebinds undo manager after loadDocument", () => {
    const editor = createEditor();
    const oldUndoManager = editor.undoManager;
    const newDoc = editor.internals.adapter.createDocument();

    editor.loadDocument(newDoc);

    expect(editor.undoManager).toBe(
      editor.internals.getSlot("undo:manager"),
    );
    expect(editor.undoManager).not.toBe(oldUndoManager);

    editor.destroy();
  });

  it("updates documentState parent relationships after parentId changes", () => {
    const editor = createEditor({ without: ["document-ops", "delta-stream", "undo"] });

    editor.apply([
      {
        type: "insert-block",
        blockId: "parent",
        blockType: "toggle",
        props: {},
        position: "last",
      },
      {
        type: "insert-block",
        blockId: "child",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
      {
        type: "update-block",
        blockId: "child",
        props: { parentId: "parent" },
      },
    ]);

    expect(editor.documentState.parentOf("child")).toBe("parent");

    editor.apply([
      {
        type: "update-block",
        blockId: "child",
        props: { parentId: null },
      },
    ]);

    expect(editor.documentState.parentOf("child")).toBeNull();

    editor.destroy();
  });

  it("emits structured diagnostics for unknown block types", () => {
    const editor = createEditor({ without: ["document-ops", "delta-stream", "undo"] });
    const diagnostics: unknown[] = [];

    editor.on("diagnostic", (event) => {
      diagnostics.push(event);
    });

    editor.apply([
      {
        type: "insert-block",
        blockId: "unknown",
        blockType: "not-real",
        props: {},
        position: "last",
      },
    ]);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "PEN_APPLY_002",
        level: "warn",
        source: "apply",
      }),
    );

    editor.destroy();
  });

  it("emits remediation text for extension observe failures", () => {
    const diagnostics: unknown[] = [];
    const ext = defineExtension({
      name: "broken-observe",
      observe() {
        throw new Error("boom");
      },
    });
    const editor = createEditor({
      without: ["document-ops", "delta-stream", "undo"],
      extensions: [ext],
    });

    editor.on("diagnostic", (event) => {
      diagnostics.push(event);
    });

    editor.apply([
      {
        type: "insert-block",
        blockId: "b1",
        blockType: "paragraph",
        props: {},
        position: "last",
      },
    ]);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "PEN_EXT_001",
        level: "error",
        source: "extension",
        remediation: expect.any(String),
      }),
    );

    editor.destroy();
  });

  it("processes streamed AI deltas through the default delta-stream pipeline", async () => {
    const editor = createEditor();
    const blockId = editor.firstBlock()!.id;

    await processStream(
      createStream([
        { type: "gen-start", zoneId: "zone-1", blockId },
        { type: "gen-delta", zoneId: "zone-1", delta: "Hello " },
        { type: "gen-delta", zoneId: "zone-1", delta: "world" },
        { type: "gen-end", zoneId: "zone-1", status: "complete" },
      ]),
      editor,
    );

    expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
      "Hello world",
    );
    expect(
      editor.internals.getSlot<{ generationZone: unknown }>(
        "delta-stream:target",
      )?.generationZone ?? null,
    ).toBeNull();

    editor.destroy();
  });

  it("keeps streamed AI generations in their own undo group", async () => {
    const editor = createEditor();
    const firstBlockId = editor.firstBlock()!.id;
    const secondBlockId = crypto.randomUUID();

    editor.apply(
      [
        {
          type: "insert-block",
          blockId: secondBlockId,
          blockType: "paragraph",
          props: {},
          position: "last",
        },
      ],
      { origin: "system" },
    );

    editor.apply(
      [
        {
          type: "insert-text",
          blockId: firstBlockId,
          offset: 0,
          text: "hello",
        },
      ],
      { origin: "user" },
    );

    await processStream(
      createStream([
        { type: "gen-start", zoneId: "zone-2", blockId: secondBlockId },
        { type: "gen-delta", zoneId: "zone-2", delta: "AI output" },
        { type: "gen-end", zoneId: "zone-2", status: "complete" },
      ]),
      editor,
    );

    expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
      "hello",
    );
    expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
      "AI output",
    );

    expect(editor.undoManager.undo()).toBe(true);
    expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
      "hello",
    );
    expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe("");

    expect(editor.undoManager.redo()).toBe(true);
    expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
      "AI output",
    );

    expect(editor.undoManager.undo()).toBe(true);
    expect(editor.undoManager.undo()).toBe(true);
    expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe("");
    expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe("");

    editor.destroy();
  });
});
