import { useSyncExternalStore } from "react";
import type { Editor } from "@pen/core";

export function useExtensionState<T>(editor: Editor, name: string): T | undefined {
  return useSyncExternalStore(
    (callback) => editor.on(`ext:${name}:stateChange` as any, callback),
    () => editor.getExtensionState<T>(name),
    () => undefined,
  );
}
