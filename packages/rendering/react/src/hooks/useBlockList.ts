import { useSyncExternalStore } from "react";
import type { Editor } from "@pen/core";

const SSR_BLOCK_ORDER: readonly string[] = [];

export function useBlockList(editor: Editor): readonly string[] {
  return useSyncExternalStore(
    (callback) => editor.onDocumentCommit(callback),
    () => editor.documentState.blockOrder,
    () => SSR_BLOCK_ORDER,
  );
}
