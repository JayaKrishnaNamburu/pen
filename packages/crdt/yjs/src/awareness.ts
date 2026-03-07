import type { Awareness, AwarenessChangeEvent } from "@pen/types";
import { Awareness as YAwareness } from "y-protocols/awareness";

import type { YjsCRDTDocument } from "./document.js";

export function createYjsAwareness(doc: YjsCRDTDocument): Awareness {
  const awareness = new YAwareness(doc.ydoc);
  const callbackMap = new WeakMap<Function, Function>();

  return {
    getLocalState(): Record<string, unknown> | null {
      return awareness.getLocalState() as Record<string, unknown> | null;
    },
    setLocalState(state: Record<string, unknown>) {
      awareness.setLocalState(state);
    },
    getStates(): Map<number, Record<string, unknown>> {
      return awareness.getStates() as Map<number, Record<string, unknown>>;
    },
    on(
      event: "change",
      callback: (changes: AwarenessChangeEvent) => void,
    ) {
      const wrapper = (
        changes: { added: number[]; updated: number[]; removed: number[] },
      ) => {
        callback({
          added: changes.added,
          updated: changes.updated,
          removed: changes.removed,
        });
      };
      callbackMap.set(callback, wrapper);
      awareness.on(event, wrapper);
    },
    off(
      event: "change",
      callback: (changes: AwarenessChangeEvent) => void,
    ) {
      const wrapper = callbackMap.get(callback);
      if (wrapper) {
        awareness.off(event, wrapper as (...args: unknown[]) => void);
        callbackMap.delete(callback);
      }
    },
    destroy() {
      awareness.destroy();
    },
  };
}
