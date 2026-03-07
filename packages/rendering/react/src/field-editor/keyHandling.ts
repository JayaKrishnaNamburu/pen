import type { Editor } from "@pen/core";
import type { FieldEditorImpl } from "./fieldEditorImpl.js";
import { applyEnterBehavior, type SelectionRange } from "./commands.js";

export function handleFieldEditorKeyDown(options: {
  event: KeyboardEvent;
  editor: Editor;
  fieldEditor: FieldEditorImpl;
  ytext: {
    length: number;
    toString(): string;
    insert(offset: number, text: string): void;
    delete(offset: number, length: number): void;
  };
  range: SelectionRange | null;
}): boolean {
  const { event, editor, fieldEditor, ytext, range } = options;
  const blockId = fieldEditor.activeBlockId;
  if (!blockId) return false;

  if (event.key === "Enter" && !event.shiftKey) {
    const target = applyEnterBehavior(editor, {
      blockId,
      inputMode: fieldEditor.inputMode,
      ytext,
      range,
    });
    if (!target) return false;

    fieldEditor.activateTextSelection(
      target.blockId,
      target.anchorOffset,
      target.focusOffset,
    );
    return true;
  }

  const bindings = collectKeyBindings(editor);
  for (const binding of bindings) {
    if (matchesKey(binding.key, event) && binding.handler(editor)) {
      return true;
    }
  }

  return false;
}

function collectKeyBindings(editor: Editor): ReadonlyArray<{
  key: string;
  handler: (editor: Editor) => boolean;
}> {
  return (
    (editor as any)._extensions?.collectKeyBindings?.(editor.schema) ?? []
  );
}

function matchesKey(pattern: string, event: KeyboardEvent): boolean {
  const parts = pattern.split("-");
  const key = parts.pop()?.toLowerCase() ?? "";

  const needsCtrl = parts.includes("Ctrl");
  const needsMeta = parts.includes("Meta");
  const needsMod = parts.includes("Mod");
  const needsShift = parts.includes("Shift");
  const needsAlt = parts.includes("Alt");

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform ?? "");

  const modKey = needsMod ? (isMac ? event.metaKey : event.ctrlKey) : true;
  const ctrlMatch = needsCtrl ? event.ctrlKey : !needsCtrl || true;
  const metaMatch = needsMeta ? event.metaKey : !needsMeta || true;
  const shiftMatch = needsShift ? event.shiftKey : !event.shiftKey;
  const altMatch = needsAlt ? event.altKey : !event.altKey;

  return (
    modKey &&
    ctrlMatch &&
    metaMatch &&
    shiftMatch &&
    altMatch &&
    event.key.toLowerCase() === key
  );
}
