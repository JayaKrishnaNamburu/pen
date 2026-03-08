import type {
  AppPlacement,
  CRDTEvent,
  DocumentOp,
  OpOrigin,
  Unsubscribe,
} from "@pen/types";
import { HISTORY_ORIGIN_TAG } from "@pen/types";
import * as Y from "yjs";

import { APPS, BLOCKS, BLOCK_ORDER } from "./document.js";
import type { YjsCRDTDocument } from "./document.js";

// Yjs internal type used as keys in txn.changed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAbstractType = Y.AbstractType<any>;

const KNOWN_ORIGINS: ReadonlySet<string> = new Set([
  "user",
  "ai",
  "collaborator",
  "extension",
  "history",
  "input-rule",
  "app",
  "import",
  "system",
]);

function isHistoryOrigin(origin: unknown): boolean {
  if (origin instanceof Y.UndoManager) return true;
  if (
    origin != null &&
    typeof origin === "object" &&
    (origin as Record<string, unknown>)[HISTORY_ORIGIN_TAG] === true
  ) {
    return true;
  }
  return false;
}

function originToOpOrigin(origin: unknown): OpOrigin {
  if (origin === null || origin === undefined) return "user";
  if (isHistoryOrigin(origin)) return "history";
  if (typeof origin === "string" && KNOWN_ORIGINS.has(origin))
    return origin as OpOrigin;
  return "extension";
}

function resolveBlockId(
  ytype: AnyAbstractType,
  blocksMap: Y.Map<Y.Map<unknown>>,
): string | null {
  let current: AnyAbstractType | null = ytype;
  while (current != null) {
    const item = (current as { _item?: { parent: unknown; parentSub: string | null } })._item;
    if (item == null) break;
    if (item.parent === blocksMap && item.parentSub != null) {
      return item.parentSub;
    }
    current = item.parent as AnyAbstractType | null;
  }
  return null;
}

function extractAffectedBlocks(txn: Y.Transaction): string[] {
  const blockIds = new Set<string>();
  const blocksMap = txn.doc.getMap(BLOCKS) as Y.Map<Y.Map<unknown>>;
  const blockOrderArray = txn.doc.getArray(BLOCK_ORDER);

  for (const [ytype, keys] of txn.changed) {
    if ((ytype as unknown) === (blocksMap as unknown)) {
      for (const key of keys) {
        if (key !== null) blockIds.add(key);
      }
      continue;
    }
    if ((ytype as unknown) === (blockOrderArray as unknown)) {
      const arr = blockOrderArray.toArray() as string[];
      for (const id of arr) blockIds.add(id);
      continue;
    }
    const blockId = resolveBlockId(ytype, blocksMap);
    if (blockId) blockIds.add(blockId);
  }

  return Array.from(blockIds);
}

// ── Op Reconstruction (best-effort) ─────────────────────────

function reconstructOpsFromBlocksMap(
  txn: Y.Transaction,
  blocksMap: Y.Map<Y.Map<unknown>>,
): DocumentOp[] {
  const ops: DocumentOp[] = [];
  const blocksChanges = txn.changed.get(blocksMap as AnyAbstractType);
  if (!blocksChanges) return ops;

  for (const key of blocksChanges) {
    if (key === null) continue;
    const blockMap = blocksMap.get(key);
    if (blockMap) {
      const blockType = blockMap.get("type") as string;
      const propsMap = blockMap.get("props") as Y.Map<unknown> | undefined;
      ops.push({
        type: "insert-block",
        blockId: key,
        blockType: blockType ?? "paragraph",
        props: propsMap ? Object.fromEntries(propsMap.entries()) : {},
        position: "last",
      });
    } else {
      ops.push({ type: "delete-block", blockId: key });
    }
  }
  return ops;
}

function reconstructOpsFromProps(
  txn: Y.Transaction,
  blocksMap: Y.Map<Y.Map<unknown>>,
): DocumentOp[] {
  const ops: DocumentOp[] = [];

  for (const [ytype, keys] of txn.changed) {
    if (!(ytype instanceof Y.Map)) continue;
    const item = (ytype as { _item?: { parentSub: string | null; parent: unknown } })._item;
    if (!item || item.parentSub !== "props") continue;
    const parentBlock = item.parent;
    if (!parentBlock) continue;
    const parentItem = (parentBlock as { _item?: { parent: unknown; parentSub: string | null } })._item;
    if (!parentItem || (parentItem.parent as unknown) !== (blocksMap as unknown))
      continue;
    const blockId = parentItem.parentSub;
    if (!blockId) continue;

    const changedProps: Record<string, unknown> = {};
    for (const key of keys) {
      if (key !== null) changedProps[key] = ytype.get(key);
    }
    if (Object.keys(changedProps).length > 0) {
      ops.push({ type: "update-block", blockId, props: changedProps });
    }
  }
  return ops;
}

function reconstructOpsFromTextDeltas(
  textDeltas: Map<string, { delta: unknown[] }>,
): DocumentOp[] {
  const ops: DocumentOp[] = [];
  for (const [blockId, { delta }] of textDeltas) {
    let offset = 0;
    for (const d of delta as Array<{
      insert?: string;
      delete?: number;
      retain?: number;
      attributes?: Record<string, unknown>;
    }>) {
      if (typeof d.insert === "string") {
        ops.push({
          type: "insert-text",
          blockId,
          offset,
          text: d.insert,
          marks: d.attributes,
        });
        offset += d.insert.length;
      } else if (d.delete != null) {
        ops.push({ type: "delete-text", blockId, offset, length: d.delete });
      } else if (d.retain != null) {
        if (d.attributes) {
          ops.push({
            type: "format-text",
            blockId,
            offset,
            length: d.retain,
            marks: d.attributes,
          });
        }
        offset += d.retain;
      }
    }
  }
  return ops;
}

function reconstructOpsFromAppsMap(
  txn: Y.Transaction,
  appsMap: Y.Map<Y.Map<unknown>>,
): DocumentOp[] {
  const ops: DocumentOp[] = [];
  const appsChanges = txn.changed.get(appsMap as AnyAbstractType);
  if (!appsChanges) return ops;

  for (const key of appsChanges) {
    if (key === null) continue;
    const appMap = appsMap.get(key);
    if (appMap) {
      const appType = (appMap.get("type") as string) ?? "unknown";
      const placementMap = appMap.get("placement") as Record<string, unknown> | undefined;
      const configMap = appMap.get("config") as Y.Map<unknown> | undefined;
      ops.push({
        type: "create-app",
        appId: key,
        appType,
        placement: (placementMap as AppPlacement) ?? {
          mode: "anchored",
          blockId: "",
          anchor: "after",
        },
        config: configMap ? Object.fromEntries(configMap.entries()) : {},
      });
    } else {
      ops.push({ type: "delete-app", appId: key });
    }
  }
  return ops;
}

function reconstructOps(
  txn: Y.Transaction,
  textDeltas: Map<string, { delta: unknown[] }>,
): DocumentOp[] {
  const blocksMap = txn.doc.getMap(BLOCKS) as Y.Map<Y.Map<unknown>>;
  const appsMap = txn.doc.getMap(APPS) as Y.Map<Y.Map<unknown>>;
  return [
    ...reconstructOpsFromBlocksMap(txn, blocksMap),
    ...reconstructOpsFromProps(txn, blocksMap),
    ...reconstructOpsFromTextDeltas(textDeltas),
    ...reconstructOpsFromAppsMap(txn, appsMap),
  ];
}

// ── Observer ────────────────────────────────────────────────

export function createObserver(
  doc: YjsCRDTDocument,
  callback: (event: CRDTEvent) => void,
): Unsubscribe {
  const blocksMap = doc.penDocument.blocks;

  let pendingTextDeltas = new Map<string, { delta: unknown[] }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deepHandler = (events: Y.YEvent<any>[]) => {
    for (const event of events) {
      if (!(event instanceof Y.YTextEvent)) continue;
      const blockId = resolveBlockId(event.target as AnyAbstractType, blocksMap);
      if (blockId) {
        pendingTextDeltas.set(blockId, { delta: event.delta });
      }
    }
  };

  const txnHandler = (txn: Y.Transaction) => {
    const derivedOrigin = originToOpOrigin(txn.origin);
    if (txn.changed.size === 0 && pendingTextDeltas.size === 0) {
      return;
    }

    const textDeltas = pendingTextDeltas;
    pendingTextDeltas = new Map();

    const event: CRDTEvent = {
      origin: derivedOrigin,
      affectedBlocks: extractAffectedBlocks(txn),
      ops: reconstructOps(txn, textDeltas),
      timestamp: Date.now(),
    };
    callback(event);
  };

  blocksMap.observeDeep(deepHandler);
  doc.ydoc.on("afterTransaction", txnHandler);

  return () => {
    blocksMap.unobserveDeep(deepHandler);
    doc.ydoc.off("afterTransaction", txnHandler);
  };
}
