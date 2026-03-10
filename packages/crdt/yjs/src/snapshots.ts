import type { CRDTAdapter } from "@pen/types";
import * as Y from "yjs";

import { wrapYjsDocument } from "./document";
import type { YjsCRDTDocument } from "./document";

export function createYjsSnapshot(doc: YjsCRDTDocument): Uint8Array {
  return Y.encodeSnapshot(Y.snapshot(doc.ydoc));
}

export function restoreYjsSnapshot(
  adapter: CRDTAdapter,
  doc: YjsCRDTDocument,
  snapshot: Uint8Array,
): YjsCRDTDocument {
  const restoredDoc = Y.createDocFromSnapshot(
    doc.ydoc,
    Y.decodeSnapshot(snapshot),
  );
  return wrapYjsDocument(adapter, restoredDoc);
}

export function mergeYjsUpdates(updates: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(updates);
}

export interface ForkOptions {
  gc?: boolean;
}

export function forkDocument(
  adapter: CRDTAdapter,
  doc: YjsCRDTDocument,
  options?: ForkOptions,
): YjsCRDTDocument {
  const state = Y.encodeStateAsUpdate(doc.ydoc);
  const forkedYdoc = new Y.Doc({ gc: options?.gc ?? doc.ydoc.gc });
  Y.applyUpdate(forkedYdoc, state);
  return wrapYjsDocument(adapter, forkedYdoc);
}

export function mergeDocuments(
  target: YjsCRDTDocument,
  source: YjsCRDTDocument,
): void {
  const stateVector = Y.encodeStateVector(target.ydoc);
  const diff = Y.encodeStateAsUpdate(source.ydoc, stateVector);
  Y.applyUpdate(target.ydoc, diff);
}
