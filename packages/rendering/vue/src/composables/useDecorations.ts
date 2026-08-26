import type { Editor } from "@input/pen-types";
import { useEditorContext } from "../internal/editorContext";
import { useExternalStore } from "../internal/useExternalStore";

/**
 * Track the editor's decoration set as a readonly ref, updating on
 * `decorationsChange`. Defaults to the editor provided by the enclosing
 * `PenEditor`, so it may only be called without an argument inside that
 * component tree.
 */
export function useDecorations(editor?: Editor) {
  const resolvedEditor = editor ?? useEditorContext().editor;

  return useExternalStore(
    (callback) => resolvedEditor.on("decorationsChange", callback),
    () => resolvedEditor.getDecorations(),
    (left, right) => left.equals(right),
  );
}
