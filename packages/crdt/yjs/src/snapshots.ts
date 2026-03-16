import type { CRDTAdapter } from "@pen/types";
import * as Y from "yjs";

import { BLOCKS, SUBDOCUMENT, wrapYjsDocument } from "./document";
import type { YjsCRDTDocument } from "./document";

const SNAPSHOT_MAGIC = "PENYJS1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const SNAPSHOT_MAGIC_BYTES = textEncoder.encode(SNAPSHOT_MAGIC);

interface RecursiveSnapshotEnvelope {
  version: 1;
  rootState: number[];
  subdocs: RecursiveSubdocumentSnapshot[];
}

interface RecursiveSubdocumentSnapshot {
  ownerPath: string[];
  state: number[];
}

export function createYjsSnapshot(doc: YjsCRDTDocument): Uint8Array {
  const envelope: RecursiveSnapshotEnvelope = {
    version: 1,
    rootState: Array.from(Y.encodeStateAsUpdate(doc.ydoc)),
    subdocs: collectSubdocumentSnapshots(doc.ydoc, []),
  };
  const payload = textEncoder.encode(JSON.stringify(envelope));
  return concatUint8Arrays(SNAPSHOT_MAGIC_BYTES, payload);
}

export function restoreYjsSnapshot(
  adapter: CRDTAdapter,
  doc: YjsCRDTDocument,
  snapshot: Uint8Array,
): YjsCRDTDocument {
  const envelope = decodeRecursiveSnapshotEnvelope(snapshot);
  if (envelope) {
    const restoredDoc = new Y.Doc({ gc: doc.ydoc.gc });
    Y.applyUpdate(restoredDoc, Uint8Array.from(envelope.rootState));
    for (const subdocSnapshot of envelope.subdocs) {
      const subdoc = resolveSubdocumentByOwnerPath(
        restoredDoc,
        subdocSnapshot.ownerPath,
      );
      if (!subdoc) {
        continue;
      }
      Y.applyUpdate(subdoc, Uint8Array.from(subdocSnapshot.state));
    }
    return wrapYjsDocument(adapter, restoredDoc);
  }

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

function collectSubdocumentSnapshots(
  ydoc: Y.Doc,
  ownerPath: string[],
): RecursiveSubdocumentSnapshot[] {
  const snapshots: RecursiveSubdocumentSnapshot[] = [];
  const blocks = ydoc.getMap<Y.Map<unknown>>(BLOCKS);
  for (const [blockId, blockMap] of blocks.entries()) {
    const subdoc = blockMap.get(SUBDOCUMENT);
    if (!(subdoc instanceof Y.Doc)) {
      continue;
    }
    const nextOwnerPath = [...ownerPath, blockId];
    snapshots.push({
      ownerPath: nextOwnerPath,
      state: Array.from(Y.encodeStateAsUpdate(subdoc)),
    });
    snapshots.push(...collectSubdocumentSnapshots(subdoc, nextOwnerPath));
  }
  return snapshots;
}

function resolveSubdocumentByOwnerPath(
  ydoc: Y.Doc,
  ownerPath: readonly string[],
): Y.Doc | null {
  let currentDoc = ydoc;
  for (const blockId of ownerPath) {
    const blocks = currentDoc.getMap<Y.Map<unknown>>(BLOCKS);
    const blockMap = blocks.get(blockId);
    const subdoc = blockMap?.get(SUBDOCUMENT);
    if (!(subdoc instanceof Y.Doc)) {
      return null;
    }
    currentDoc = subdoc;
  }
  return currentDoc;
}

function decodeRecursiveSnapshotEnvelope(
  snapshot: Uint8Array,
): RecursiveSnapshotEnvelope | null {
  if (
    snapshot.byteLength <= SNAPSHOT_MAGIC_BYTES.length ||
    !startsWithBytes(snapshot, SNAPSHOT_MAGIC_BYTES)
  ) {
    return null;
  }

  try {
    const payload = textDecoder.decode(snapshot.slice(SNAPSHOT_MAGIC_BYTES.length));
    const parsed = JSON.parse(payload) as Partial<RecursiveSnapshotEnvelope>;
    if (parsed.version !== 1 || !Array.isArray(parsed.rootState) || !Array.isArray(parsed.subdocs)) {
      return null;
    }
    return {
      version: 1,
      rootState: parsed.rootState,
      subdocs: parsed.subdocs.filter(isRecursiveSubdocumentSnapshot),
    };
  } catch {
    return null;
  }
}

function isRecursiveSubdocumentSnapshot(
  value: unknown,
): value is RecursiveSubdocumentSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RecursiveSubdocumentSnapshot>;
  return (
    Array.isArray(candidate.ownerPath) &&
    candidate.ownerPath.every((entry) => typeof entry === "string") &&
    Array.isArray(candidate.state) &&
    candidate.state.every((entry) => typeof entry === "number")
  );
}

function startsWithBytes(value: Uint8Array, prefix: Uint8Array): boolean {
  if (value.byteLength < prefix.byteLength) {
    return false;
  }
  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (value[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, array) => sum + array.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.byteLength;
  }
  return result;
}
