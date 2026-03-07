import type { DocumentOp, Editor } from "@pen/core";

const ZERO_WIDTH_SPACE = "\u200B";

export interface SelectionRange {
  start: number;
  end: number;
}

export interface SelectionTarget {
  blockId: string;
  anchorOffset: number;
  focusOffset: number;
}

// ── Enter action resolution ──────────────────────────────────

type EnterAction =
  | { action: "split"; newBlockType: string | undefined }
  | { action: "convert"; newType: string }
  | { action: "insert-text"; text: string };

const LIST_BLOCK_TYPES = new Set([
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
]);

const HEADING_TYPES = new Set(["heading"]);

const CONTAINER_EXIT_TYPES = new Set(["blockquote", "callout"]);

function isBlockEmpty(ytext: { length: number; toString(): string }): boolean {
  const text = ytext.toString();
  return text.length === 0 || text === ZERO_WIDTH_SPACE;
}

export function resolveEnterAction(
  editor: Editor,
  blockId: string,
  inputMode: "richtext" | "code" | "table" | "none",
  ytext: { length: number; toString(): string },
): EnterAction | null {
  if (inputMode === "code") {
    return { action: "insert-text", text: "\n" };
  }

  if (inputMode !== "richtext") {
    return null;
  }

  const block = editor.getBlock(blockId);
  if (!block) return null;

  const blockType = block.type;
  const empty = isBlockEmpty(ytext);

  if (empty && LIST_BLOCK_TYPES.has(blockType)) {
    return { action: "convert", newType: "paragraph" };
  }

  if (empty && CONTAINER_EXIT_TYPES.has(blockType)) {
    return { action: "convert", newType: "paragraph" };
  }

  if (HEADING_TYPES.has(blockType)) {
    return { action: "split", newBlockType: "paragraph" };
  }

  return { action: "split", newBlockType: undefined };
}

// ── Offset normalization ─────────────────────────────────────

export function normalizeInlineOffset(
  ytext: { length: number; toString(): string },
  offset: number,
): number {
  const text = ytext.toString();
  if (text === ZERO_WIDTH_SPACE) {
    return 0;
  }

  return Math.max(0, Math.min(offset, ytext.length));
}

// ── Commands ─────────────────────────────────────────────────

export function splitBlockAtOffset(
  editor: Editor,
  options: {
    blockId: string;
    offset: number;
    newBlockType?: string;
  },
): SelectionTarget {
  const { blockId, offset, newBlockType } = options;
  const newBlockId = crypto.randomUUID();

  editor.apply([
    {
      type: "split-block",
      blockId,
      offset,
      newBlockId,
      newBlockType,
    } as DocumentOp,
  ]);

  return {
    blockId: newBlockId,
    anchorOffset: 0,
    focusOffset: 0,
  };
}

export function convertBlock(
  editor: Editor,
  options: {
    blockId: string;
    newType: string;
  },
): SelectionTarget {
  editor.apply([
    {
      type: "convert-block",
      blockId: options.blockId,
      newType: options.newType,
    } as DocumentOp,
  ]);

  return {
    blockId: options.blockId,
    anchorOffset: 0,
    focusOffset: 0,
  };
}

export function insertTextAtRange(
  editor: Editor,
  ytext: {
    insert(offset: number, text: string): void;
    delete(offset: number, length: number): void;
  },
  options: {
    blockId: string;
    range: SelectionRange | null;
    text: string;
  },
): SelectionTarget {
  const { blockId, range, text } = options;
  const start = range?.start ?? 0;
  const end = range?.end ?? start;

  editor.internals.adapter.transact(
    editor.internals.crdtDoc,
    () => {
      if (end > start) {
        ytext.delete(start, end - start);
      }
      ytext.insert(start, text);
    },
    "user",
  );

  const nextOffset = start + text.length;
  return {
    blockId,
    anchorOffset: nextOffset,
    focusOffset: nextOffset,
  };
}

export function applyEnterBehavior(
  editor: Editor,
  options: {
    blockId: string;
    inputMode: "richtext" | "code" | "table" | "none";
    ytext: {
      length: number;
      toString(): string;
      insert(offset: number, text: string): void;
      delete(offset: number, length: number): void;
    };
    range: SelectionRange | null;
  },
): SelectionTarget | null {
  const { blockId, inputMode, ytext, range } = options;

  const enterAction = resolveEnterAction(editor, blockId, inputMode, ytext);
  if (!enterAction) return null;

  switch (enterAction.action) {
    case "insert-text":
      return insertTextAtRange(editor, ytext, {
        blockId,
        range,
        text: enterAction.text,
      });

    case "convert":
      return convertBlock(editor, {
        blockId,
        newType: enterAction.newType,
      });

    case "split":
      return splitBlockAtOffset(editor, {
        blockId,
        offset: normalizeInlineOffset(ytext, range?.start ?? ytext.length),
        newBlockType: enterAction.newBlockType,
      });
  }
}
