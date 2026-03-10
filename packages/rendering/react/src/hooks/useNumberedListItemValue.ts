import { useSyncExternalStore } from "react";
import {
  getNumberedListItemValue as getOrderedListValue,
  type BlockHandle,
} from "@pen/core";
import { useEditorContext } from "../context/editorContext";

export function useNumberedListItemValue(block: BlockHandle): number {
  const { editor } = useEditorContext();
  const fallbackValue = getOrderedListValue(block) ?? 1;

  return useSyncExternalStore(
    (callback) => editor.onDocumentCommit(() => callback()),
    () => getOrderedListValue(editor.getBlock(block.id)) ?? fallbackValue,
    () => fallbackValue,
  );
}
