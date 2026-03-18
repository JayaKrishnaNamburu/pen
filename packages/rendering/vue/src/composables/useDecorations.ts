import type { Editor } from "@pen/types";
import { useEditorContext } from "../internal/editorContext";
import { useExternalStore } from "../internal/useExternalStore";

export function useDecorations(editor?: Editor) {
  const resolvedEditor = editor ?? useEditorContext().editor;

  return useExternalStore(
    (callback) => resolvedEditor.on("decorationsChange", callback),
    () => resolvedEditor.getDecorations(),
    (left, right) => left.equals(right),
  );
}
