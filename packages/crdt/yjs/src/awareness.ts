import type { Awareness, AwarenessChangeEvent } from "@pen/types";
import { Awareness as YAwareness } from "y-protocols/awareness";
import * as awarenessProtocol from "y-protocols/awareness";

import type { YjsCRDTDocument } from "./document";

const awarenessInstances = new WeakMap<Awareness, YAwareness>();
const RAW_AWARENESS_SYMBOL = Symbol.for("pen.yjs.awareness");

export type YjsAwareness = YAwareness;

export function createYjsAwareness(doc: YjsCRDTDocument): Awareness {
  const awareness = new YAwareness(doc.ydoc);
  const callbackMap = new WeakMap<Function, Function>();

  const wrappedAwareness: Awareness = {
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

  awarenessInstances.set(wrappedAwareness, awareness);
  Object.defineProperty(wrappedAwareness, RAW_AWARENESS_SYMBOL, {
    value: awareness,
    enumerable: false,
    configurable: false,
  });
  return wrappedAwareness;
}

export function getYjsAwareness(awareness: Awareness): YAwareness {
  const rawAwareness = awarenessInstances.get(awareness);
  if (!rawAwareness) {
    throw new Error("Expected a Yjs awareness instance");
  }
  return rawAwareness;
}

export function encodeYjsAwarenessUpdate(
  awareness: Awareness,
  clients: number[],
): Uint8Array {
  return awarenessProtocol.encodeAwarenessUpdate(
		getYjsAwareness(awareness),
    clients,
  );
}

export function applyYjsAwarenessUpdate(
  awareness: Awareness,
  update: Uint8Array,
  origin: unknown = "remote",
): void {
  awarenessProtocol.applyAwarenessUpdate(
		getYjsAwareness(awareness),
    update,
    origin,
  );
}
