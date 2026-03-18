import type { Editor } from "@pen/types";
import { getRootBlockIds } from "@pen/dom/utils/parentIdTree";
import { useEditorContext } from "../internal/editorContext";
import { useExternalStore } from "../internal/useExternalStore";

export function useBlockList(editor?: Editor) {
  const resolvedEditor = editor ?? useEditorContext().editor;

  return useExternalStore(
    (callback) => resolvedEditor.onDocumentCommit(() => callback()),
    () => [...getRootBlockIds(resolvedEditor)],
    stringArrayEqual,
  );
}

function stringArrayEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
