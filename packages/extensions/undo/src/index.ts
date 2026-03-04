import type { Extension, OpOrigin } from "@pen/core";

export interface UndoOptions {
  captureTimeout?: number;
  ignoredOrigins?: OpOrigin[];
}

export function undo(_options?: UndoOptions): Extension {
  throw new Error("Not implemented");
}
