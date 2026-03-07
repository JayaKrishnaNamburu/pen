import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import {
  applyEnterBehavior,
  resolveEnterAction,
  splitBlockAtOffset,
} from "../field-editor/commands.js";

function visibleText(text: string): string {
  return text.replace(/\u200B/g, "");
}

function getYText(editor: ReturnType<typeof createEditor>, blockId: string): any {
  const adapter = editor.internals.adapter;
  const doc = editor.internals.crdtDoc;
  const ydoc = adapter.raw(doc) as any;
  return ydoc.getMap("blocks").get(blockId)?.get("content");
}

function editorOpts() {
  return { without: ["document-ops", "delta-stream", "undo"] };
}

describe("@pen/react field-editor commands", () => {
  it("splits a block and returns the next selection target", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "insert-text", blockId, offset: 0, text: "HelloWorld" }]);

    const target = splitBlockAtOffset(editor, { blockId, offset: 5 });

    expect(editor.blockCount()).toBe(2);
    expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("Hello");
    expect(visibleText(editor.getBlock(target.blockId)!.textContent())).toBe("World");
    expect(target.anchorOffset).toBe(0);
    expect(target.focusOffset).toBe(0);

    editor.destroy();
  });

  it("uses newline insertion for code input mode", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([
      { type: "convert-block", blockId, newType: "codeBlock" },
      { type: "insert-text", blockId, offset: 0, text: "abcd" },
    ]);

    const target = applyEnterBehavior(editor, {
      blockId,
      inputMode: "code",
      ytext: getYText(editor, blockId),
      range: { start: 2, end: 2 },
    });

    expect(editor.blockCount()).toBe(1);
    expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("ab\ncd");
    expect(target).toEqual({ blockId, anchorOffset: 3, focusOffset: 3 });

    editor.destroy();
  });
});

describe("resolveEnterAction – schema-aware Enter", () => {
  it("returns split with paragraph type for heading blocks", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([
      { type: "convert-block", blockId, newType: "heading", newProps: { level: 1 } },
      { type: "insert-text", blockId, offset: 0, text: "Title" },
    ]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "split", newBlockType: "paragraph" });

    editor.destroy();
  });

  it("converts empty bullet list item to paragraph", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "convert-block", blockId, newType: "bulletListItem" }]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "convert", newType: "paragraph" });

    editor.destroy();
  });

  it("splits non-empty bullet list item (keeps type)", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([
      { type: "convert-block", blockId, newType: "bulletListItem" },
      { type: "insert-text", blockId, offset: 0, text: "item" },
    ]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "split", newBlockType: undefined });

    editor.destroy();
  });

  it("converts empty numbered list item to paragraph", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "convert-block", blockId, newType: "numberedListItem" }]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "convert", newType: "paragraph" });

    editor.destroy();
  });

  it("converts empty check list item to paragraph", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "convert-block", blockId, newType: "checkListItem" }]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "convert", newType: "paragraph" });

    editor.destroy();
  });

  it("converts empty blockquote to paragraph", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "convert-block", blockId, newType: "blockquote" }]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "convert", newType: "paragraph" });

    editor.destroy();
  });

  it("splits non-empty blockquote (keeps type)", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([
      { type: "convert-block", blockId, newType: "blockquote" },
      { type: "insert-text", blockId, offset: 0, text: "quote" },
    ]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "split", newBlockType: undefined });

    editor.destroy();
  });

  it("converts empty callout to paragraph", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "convert-block", blockId, newType: "callout" }]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "convert", newType: "paragraph" });

    editor.destroy();
  });

  it("returns insert-text for code blocks", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "convert-block", blockId, newType: "codeBlock" }]);

    const action = resolveEnterAction(editor, blockId, "code", getYText(editor, blockId));
    expect(action).toEqual({ action: "insert-text", text: "\n" });

    editor.destroy();
  });

  it("returns null for table mode", () => {
    const action = resolveEnterAction({} as any, "x", "table", { length: 0, toString: () => "" });
    expect(action).toBeNull();
  });

  it("returns null for none mode", () => {
    const action = resolveEnterAction({} as any, "x", "none", { length: 0, toString: () => "" });
    expect(action).toBeNull();
  });

  it("splits paragraph with no newBlockType override", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "insert-text", blockId, offset: 0, text: "hello" }]);

    const action = resolveEnterAction(editor, blockId, "richtext", getYText(editor, blockId));
    expect(action).toEqual({ action: "split", newBlockType: undefined });

    editor.destroy();
  });
});

describe("applyEnterBehavior – integration", () => {
  it("heading Enter produces a paragraph block", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([
      { type: "convert-block", blockId, newType: "heading", newProps: { level: 2 } },
      { type: "insert-text", blockId, offset: 0, text: "Section" },
    ]);

    const target = applyEnterBehavior(editor, {
      blockId,
      inputMode: "richtext",
      ytext: getYText(editor, blockId),
      range: { start: 7, end: 7 },
    });

    expect(target).not.toBeNull();
    expect(editor.blockCount()).toBe(2);
    expect(editor.getBlock(blockId)!.type).toBe("heading");
    expect(editor.getBlock(target!.blockId)!.type).toBe("paragraph");

    editor.destroy();
  });

  it("empty bulletListItem Enter converts to paragraph (no new block)", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([{ type: "convert-block", blockId, newType: "bulletListItem" }]);

    const target = applyEnterBehavior(editor, {
      blockId,
      inputMode: "richtext",
      ytext: getYText(editor, blockId),
      range: { start: 0, end: 0 },
    });

    expect(target).not.toBeNull();
    expect(editor.blockCount()).toBe(1);
    expect(target!.blockId).toBe(blockId);
    expect(editor.getBlock(blockId)!.type).toBe("paragraph");

    editor.destroy();
  });

  it("non-empty bulletListItem Enter splits (keeps list type)", () => {
    const editor = createEditor(editorOpts());
    const blockId = editor.firstBlock()!.id;

    editor.apply([
      { type: "convert-block", blockId, newType: "bulletListItem" },
      { type: "insert-text", blockId, offset: 0, text: "task" },
    ]);

    const target = applyEnterBehavior(editor, {
      blockId,
      inputMode: "richtext",
      ytext: getYText(editor, blockId),
      range: { start: 4, end: 4 },
    });

    expect(target).not.toBeNull();
    expect(editor.blockCount()).toBe(2);
    expect(editor.getBlock(blockId)!.type).toBe("bulletListItem");
    expect(editor.getBlock(target!.blockId)!.type).toBe("bulletListItem");

    editor.destroy();
  });
});
