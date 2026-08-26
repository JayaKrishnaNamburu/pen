import type { Editor } from "@input/pen-types";
import { useEditorContext } from "../internal/editorContext";
import { useExternalStore } from "../internal/useExternalStore";

/**
 * Track the editor's current selection as a readonly ref. Defaults to
 * the editor provided by the enclosing `PenEditor`, so it may only be
 * called without an argument inside that component tree.
 */
export function useSelection(editor?: Editor) {
  const resolvedEditor = editor ?? useEditorContext().editor;

  return useExternalStore(
    (callback) => resolvedEditor.on("selectionChange", callback),
    () => resolvedEditor.selection,
  );
}
