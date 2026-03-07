import { useSyncExternalStore } from "react";
import type { Editor } from "@pen/core";

export function useBlockList(editor: Editor): readonly string[] {
  return useSyncExternalStore(
    (callback) => editor.on("documentChange", callback),
    () => editor.documentState.blockOrder,
    () => [],
  );
}
