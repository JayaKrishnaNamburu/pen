import type { Editor } from "@pen/types";
import { useEditorContext } from "../internal/editorContext";
import { useExternalStore } from "../internal/useExternalStore";

export function useSelection(editor?: Editor) {
  const resolvedEditor = editor ?? useEditorContext().editor;

  return useExternalStore(
    (callback) => resolvedEditor.on("selectionChange", callback),
    () => resolvedEditor.selection,
  );
}
