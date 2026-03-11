import { useSyncExternalStore } from "react";
import type { Editor, DecorationSet } from "@pen/core";
import { emptyDecorationSet } from "@pen/core";

export function useDecorations(editor: Editor): DecorationSet {
  return useSyncExternalStore(
    (callback) => editor.on("decorationsChange", callback),
    () => editor.getDecorations(),
    () => emptyDecorationSet(),
  );
}
