import * as Y from "yjs";

import {
	APPS,
	BLOCKS,
	BLOCK_ORDER,
	METADATA,
	isYjsCRDTDocument,
	isYjsDoc,
} from "./document";
import type { YjsCRDTDocument } from "./document";

export type YTextDeltaOp = {
	insert?: string | object;
	delete?: number;
	retain?: number;
	attributes?: Record<string, unknown>;
};

export type YTextDelta = readonly YTextDeltaOp[];

export type YArrayDeltaOp = {
	insert?: readonly unknown[];
	delete?: number;
	retain?: number;
};

export type YArrayDelta = readonly YArrayDeltaOp[];

export type StructuralOriginTag =
	| {
			kind: "split";
			blockId: string;
			newBlockId: string;
			offset: number;
	  }
	| {
			kind: "merge";
			targetBlockId: string;
			sourceBlockId: string;
	  };

export interface RawCommitDelta {
	readonly originTag: unknown;
	readonly textDeltas: ReadonlyMap<string, readonly YTextDelta[]>;
	readonly blockOrderDelta: YArrayDelta;
	readonly childArrayDeltas: ReadonlyMap<string, YArrayDelta>;
	readonly blockMapChanges: ReadonlyMap<string, ReadonlySet<string>>;
	readonly appChanges: ReadonlySet<string>;
	readonly metadataChanges: ReadonlySet<string>;
}

export const STRUCTURAL_ORIGIN_META_KEY = "structural";

type YTypeItem = {
	parent: unknown;
	parentSub: string | null;
};

type YTypeHandle = {
	_item?: YTypeItem;
};

type SummarySourceState = {
	listeners: Set<(delta: RawCommitDelta) => void>;
	handler: (txn: Y.Transaction) => void;
};

const sources = new WeakMap<Y.Doc, SummarySourceState>();

function resolveYDoc(doc: YjsCRDTDocument | Y.Doc): Y.Doc {
	if (isYjsCRDTDocument(doc)) return doc.ydoc;
	if (isYjsDoc(doc)) return doc;
	throw new Error("createSummarySource expects a Yjs document");
}

function getTypeItem(ytype: object): YTypeItem | undefined {
	return (ytype as YTypeHandle)._item;
}

function resolveSharedKey(ytype: object, shared: object): string | null {
	let current: object | null = ytype;
	while (current != null) {
		const item = getTypeItem(current);
		if (item == null) break;
		if (item.parent === shared && item.parentSub != null) {
			return item.parentSub;
		}
		current = (item.parent as object | null) ?? null;
	}
	return null;
}

function addKeys(
	target: Map<string, Set<string>>,
	id: string,
	keys: Iterable<string | null>,
): void {
	let set = target.get(id);
	if (!set) {
		set = new Set();
		target.set(id, set);
	}
	for (const key of keys) {
		if (key != null) set.add(key);
	}
}

function snapshotTextDelta(delta: readonly YTextDeltaOp[]): YTextDelta {
	return delta.map((op) => ({
		...op,
		attributes: op.attributes ? { ...op.attributes } : undefined,
	}));
}

function snapshotArrayDelta(delta: readonly YArrayDeltaOp[]): YArrayDelta {
	return delta.map((op) => ({
		...op,
		insert: op.insert ? [...op.insert] : undefined,
	}));
}

function eventForType(
	txn: Y.Transaction,
	ytype: object,
): { delta: unknown; target: unknown } | undefined {
	for (const [type, events] of txn.changedParentTypes) {
		if ((type as object) !== ytype) continue;
		for (const event of events) {
			if (event.target === ytype) return event;
		}
	}
	for (const events of txn.changedParentTypes.values()) {
		for (const event of events) {
			if (event.target === ytype) return event;
		}
	}
	return undefined;
}

function isStructuralOriginTag(value: unknown): value is StructuralOriginTag {
	if (value == null || typeof value !== "object") return false;
	const kind = (value as { kind?: unknown }).kind;
	return kind === "split" || kind === "merge";
}

function readOriginTag(txn: Y.Transaction): unknown {
	const origin = txn.origin;
	if (origin != null && typeof origin === "object") {
		const tagged = (origin as { structural?: unknown }).structural;
		if (isStructuralOriginTag(tagged)) return origin;
	}

	const fromMeta = txn.meta.get(STRUCTURAL_ORIGIN_META_KEY);
	if (!isStructuralOriginTag(fromMeta)) return origin;

	if (origin != null && typeof origin === "object") {
		return { ...(origin as object), structural: fromMeta };
	}
	return {
		type: origin ?? "user",
		structural: fromMeta,
	};
}

function transactionToRawCommitDelta(txn: Y.Transaction): RawCommitDelta {
	const blocks = txn.doc.getMap(BLOCKS) as Y.Map<Y.Map<unknown>>;
	const blockOrder = txn.doc.getArray(BLOCK_ORDER);
	const apps = txn.doc.getMap(APPS) as Y.Map<Y.Map<unknown>>;
	const metadata = txn.doc.getMap(METADATA);

	const textDeltas = new Map<string, YTextDelta[]>();
	const childArrayDeltas = new Map<string, YArrayDelta>();
	const blockMapChanges = new Map<string, Set<string>>();
	const appChanges = new Set<string>();
	const metadataChanges = new Set<string>();
	let blockOrderDelta: YArrayDelta = [];

	for (const [ytype, keys] of txn.changed) {
		if ((ytype as unknown) === (blockOrder as unknown)) {
			const event = eventForType(txn, ytype);
			if (event) {
				blockOrderDelta = snapshotArrayDelta(
					event.delta as YArrayDeltaOp[],
				);
			}
			continue;
		}

		if ((ytype as unknown) === (blocks as unknown)) {
			for (const key of keys) {
				if (key != null) addKeys(blockMapChanges, key, []);
			}
			continue;
		}

		if ((ytype as unknown) === (apps as unknown)) {
			for (const key of keys) {
				if (key != null) appChanges.add(key);
			}
			continue;
		}

		if ((ytype as unknown) === (metadata as unknown)) {
			for (const key of keys) {
				if (key != null) metadataChanges.add(key);
			}
			continue;
		}

		if (ytype instanceof Y.Text) {
			const blockId = resolveSharedKey(ytype, blocks);
			const event = eventForType(txn, ytype);
			if (blockId && event) {
				const snapshot = snapshotTextDelta(
					event.delta as YTextDeltaOp[],
				);
				const existing = textDeltas.get(blockId);
				if (existing) {
					existing.push(snapshot);
				} else {
					textDeltas.set(blockId, [snapshot]);
				}
			}
			continue;
		}

		if (ytype instanceof Y.Array) {
			const item = getTypeItem(ytype);
			const blockId = resolveSharedKey(ytype, blocks);
			if (blockId && item?.parentSub === "children") {
				const event = eventForType(txn, ytype);
				if (event) {
					childArrayDeltas.set(
						blockId,
						snapshotArrayDelta(event.delta as YArrayDeltaOp[]),
					);
				}
				continue;
			}
			if (blockId && item?.parentSub) {
				addKeys(blockMapChanges, blockId, [item.parentSub]);
			}
			continue;
		}

		if (ytype instanceof Y.Map) {
			const appId = resolveSharedKey(ytype, apps);
			if (appId) {
				appChanges.add(appId);
				continue;
			}

			const item = getTypeItem(ytype);
			const blockId = resolveSharedKey(ytype, blocks);
			if (!blockId) continue;

			if (item?.parent === blocks) {
				addKeys(blockMapChanges, blockId, keys);
				continue;
			}

			if (item?.parentSub === "props" || item?.parentSub === "meta") {
				addKeys(blockMapChanges, blockId, keys);
				continue;
			}

			if (item?.parentSub) {
				addKeys(blockMapChanges, blockId, [item.parentSub]);
			}
		}
	}

	return {
		originTag: readOriginTag(txn),
		textDeltas,
		blockOrderDelta,
		childArrayDeltas,
		blockMapChanges,
		appChanges,
		metadataChanges,
	};
}

export function createSummarySource(
	doc: YjsCRDTDocument | Y.Doc,
	onDelta: (delta: RawCommitDelta) => void,
): () => void {
	const ydoc = resolveYDoc(doc);
	let state = sources.get(ydoc);
	if (!state) {
		const listeners = new Set<(delta: RawCommitDelta) => void>();
		const handler = (txn: Y.Transaction) => {
			if (txn.changed.size === 0 || listeners.size === 0) return;
			const delta = transactionToRawCommitDelta(txn);
			for (const listener of listeners) {
				listener(delta);
			}
		};
		ydoc.on("afterTransaction", handler);
		state = { listeners, handler };
		sources.set(ydoc, state);
	}

	state.listeners.add(onDelta);
	return () => {
		const current = sources.get(ydoc);
		if (!current) return;
		current.listeners.delete(onDelta);
		if (current.listeners.size === 0) {
			ydoc.off("afterTransaction", current.handler);
			sources.delete(ydoc);
		}
	};
}
