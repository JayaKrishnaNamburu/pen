import type { TestEditor } from "./types.js";

const INLINE_MARK_KEYS: Record<string, string> = {
  "mod-b": "bold",
  "ctrl-b": "bold",
  "meta-b": "bold",
  "mod-i": "italic",
  "ctrl-i": "italic",
  "meta-i": "italic",
  "mod-u": "underline",
  "ctrl-u": "underline",
  "meta-u": "underline",
};

export function simulateKeypress(editor: TestEditor, key: string): void;
export function simulateKeypress(_key: string): never;
export function simulateKeypress(
  editorOrKey: TestEditor | string,
  maybeKey?: string,
): void {
  if (typeof editorOrKey === "string") {
    throw new Error(
      "simulateKeypress now requires an editor instance: simulateKeypress(editor, key)",
    );
  }

  const editor = editorOrKey;
  const key = normalizeKey(maybeKey ?? "");
  const textTarget = resolveTextTarget(editor);

  if (key === "enter") {
    const offset = textTarget.to;
    const newBlockId = crypto.randomUUID();
    editor.apply(
      [
        {
          type: "split-block",
          blockId: textTarget.blockId,
          offset,
          newBlockId,
        },
      ],
      { origin: "user", undoGroup: true },
    );
    editor.selectText(newBlockId, 0, 0);
    return;
  }

  const markType = INLINE_MARK_KEYS[key];
  if (markType) {
    if (textTarget.from === textTarget.to) {
      return;
    }

    editor.apply(
      [
        {
          type: "format-text",
          blockId: textTarget.blockId,
          offset: textTarget.from,
          length: textTarget.to - textTarget.from,
          marks: { [markType]: true },
        },
      ],
      { origin: "user", undoGroup: true },
    );
    editor.selectText(textTarget.blockId, textTarget.from, textTarget.to);
    return;
  }

  throw new Error(`Unsupported simulated keypress: "${maybeKey ?? ""}"`);
}

export function simulateTyping(editor: TestEditor, text: string): void;
export function simulateTyping(_text: string): never;
export function simulateTyping(
  editorOrText: TestEditor | string,
  maybeText?: string,
): void {
  if (typeof editorOrText === "string") {
    throw new Error(
      "simulateTyping now requires an editor instance: simulateTyping(editor, text)",
    );
  }

  const editor = editorOrText;
  const text = maybeText ?? "";
  const target = resolveTextTarget(editor);

  editor.selectText(target.blockId, target.from, target.to);
  editor.replaceSelection(text);

  const nextOffset = target.from + text.length;
  editor.selectText(target.blockId, nextOffset, nextOffset);
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function resolveTextTarget(editor: TestEditor): {
  blockId: string;
  from: number;
  to: number;
} {
  const selection = editor.selection;
  if (
    selection?.type === "text" &&
    selection.anchor.blockId === selection.focus.blockId
  ) {
    return {
      blockId: selection.anchor.blockId,
      from: Math.min(selection.anchor.offset, selection.focus.offset),
      to: Math.max(selection.anchor.offset, selection.focus.offset),
    };
  }

  for (const block of editor.blocks()) {
    const schema = editor.schema.resolve(block.type);
    if (schema?.content === "inline") {
      const offset = block.length();
      return { blockId: block.id, from: offset, to: offset };
    }
  }

  throw new Error("No inline text block available for simulation");
}
