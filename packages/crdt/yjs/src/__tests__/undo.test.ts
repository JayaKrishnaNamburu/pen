import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter.js";
import { createYjsDocument, initBlockMap } from "../document.js";
import { createYjsUndoManager } from "../undo.js";

describe("undo", () => {
  const adapter = yjsAdapter();

  it("undoes and redoes text insertion", () => {
    const doc = createYjsDocument(adapter);
    doc.ydoc.transact(() => {
      initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
      doc.penDocument.blockOrder.push(["b1"]);
    });

    const undo = createYjsUndoManager(doc);
    const block = doc.penDocument.blocks.get("b1")!;
    const ytext = block.get("content") as Y.Text;

    doc.ydoc.transact(() => {
      ytext.insert(0, "Hello");
    }, "user");

    expect(ytext.toString()).toBe("Hello");

    undo.undo();
    expect(ytext.toString()).toBe("");

    undo.redo();
    expect(ytext.toString()).toBe("Hello");
  });

  it("stopCapturing creates separate undo steps", () => {
    const doc = createYjsDocument(adapter);
    doc.ydoc.transact(() => {
      initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
      doc.penDocument.blockOrder.push(["b1"]);
    });

    const undo = createYjsUndoManager(doc);
    const block = doc.penDocument.blocks.get("b1")!;
    const ytext = block.get("content") as Y.Text;

    doc.ydoc.transact(() => {
      ytext.insert(0, "First");
    }, "user");

    undo.stopCapturing();

    doc.ydoc.transact(() => {
      ytext.insert(5, " Second");
    }, "user");

    expect(ytext.toString()).toBe("First Second");

    undo.undo();
    expect(ytext.toString()).toBe("First");

    undo.undo();
    expect(ytext.toString()).toBe("");
  });

  it("does not capture collaborator-origin changes", () => {
    const doc = createYjsDocument(adapter);
    doc.ydoc.transact(() => {
      initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
      doc.penDocument.blockOrder.push(["b1"]);
    });

    const undo = createYjsUndoManager(doc);
    const block = doc.penDocument.blocks.get("b1")!;
    const ytext = block.get("content") as Y.Text;

    doc.ydoc.transact(() => {
      ytext.insert(0, "Remote text");
    }, "collaborator");

    expect(undo.canUndo()).toBe(false);
  });

  it("canUndo and canRedo reflect stack state", () => {
    const doc = createYjsDocument(adapter);
    doc.ydoc.transact(() => {
      initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
      doc.penDocument.blockOrder.push(["b1"]);
    });

    const undo = createYjsUndoManager(doc);
    expect(undo.canUndo()).toBe(false);
    expect(undo.canRedo()).toBe(false);

    const block = doc.penDocument.blocks.get("b1")!;
    const ytext = block.get("content") as Y.Text;
    doc.ydoc.transact(() => {
      ytext.insert(0, "text");
    }, "user");

    expect(undo.canUndo()).toBe(true);
    expect(undo.canRedo()).toBe(false);

    undo.undo();
    expect(undo.canUndo()).toBe(false);
    expect(undo.canRedo()).toBe(true);
  });

  it("returns false when undo/redo stack is empty", () => {
    const doc = createYjsDocument(adapter);
    const undo = createYjsUndoManager(doc);
    expect(undo.undo()).toBe(false);
    expect(undo.redo()).toBe(false);
  });

  it("restores deleted block content after undo by default", () => {
    const doc = createYjsDocument(adapter);
    doc.ydoc.transact(() => {
      initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
      doc.penDocument.blockOrder.push(["b1"]);
      const block = doc.penDocument.blocks.get("b1")!;
      const ytext = block.get("content") as Y.Text;
      ytext.insert(0, "Hello world");
    });

    const undo = createYjsUndoManager(doc);

    doc.ydoc.transact(() => {
      doc.penDocument.blockOrder.delete(0, 1);
      doc.penDocument.blocks.delete("b1");
    }, "user");

    expect(doc.penDocument.blockOrder.toArray()).toEqual([]);
    expect(doc.penDocument.blocks.get("b1")).toBeUndefined();

    undo.undo();

    expect(doc.penDocument.blockOrder.toArray()).toEqual(["b1"]);
    const restoredBlock = doc.penDocument.blocks.get("b1");
    expect(restoredBlock).toBeDefined();
    expect(restoredBlock?.get("type")).toBe("paragraph");
    expect((restoredBlock?.get("content") as Y.Text).toString()).toBe(
      "Hello world",
    );
  });
});
