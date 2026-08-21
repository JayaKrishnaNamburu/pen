import type {
	CRDTUndoManager,
	CRDTUndoStackItem,
	OpOriginType,
	UndoManagerOptions,
} from "@input/pen-types";
import { HISTORY_ORIGIN_TAG } from "@input/pen-types";
import * as Y from "yjs";

import type { YjsCRDTDocument } from "./document";
import { canonicalOrigin, HISTORY_OPERATION_KIND } from "./events";

/**
 * Default undo/redo stack depth (CH7).
 * Y.UndoManager has no native cap; oldest items are trimmed past this limit.
 */
export const DEFAULT_UNDO_MAX_DEPTH = 500;

/**
 * Y.UndoManager decides whether to capture a transaction with
 * `trackedOrigins.has(transaction.origin)`, which is identity-based. The apply
 * pipeline tags transactions with a freshly built structured origin so that
 * `groupId` / `requestId` survive into the transaction, so neither the bare
 * type string nor the interned canonical object is ever the same reference.
 * Matching on the discriminant keeps both properties: structured origins reach
 * Yjs intact, and only the tracked types are captured.
 */
class TrackedOriginSet extends Set<unknown> {
	override has(origin: unknown): boolean {
		if (super.has(origin)) {
			return true;
		}
		if (typeof origin !== "object" || origin === null) {
			return false;
		}
		const { type } = origin as { type?: unknown };
		return typeof type === "string" && super.has(type);
	}
}

export function createYjsUndoManager(
	doc: YjsCRDTDocument,
	options?: UndoManagerOptions,
): CRDTUndoManager {
	const { blockOrder, blocks } = doc.penDocument;
	const trackedOriginTypes = options?.trackedOriginTypes ?? ["user", "ai"];
	const trackedOrigins = new TrackedOriginSet(trackedOriginTypes);
	for (const type of trackedOriginTypes) {
		if (typeof type === "string") {
			trackedOrigins.add(canonicalOrigin(type as OpOriginType));
		}
	}
	const maxDepth = options?.maxDepth ?? DEFAULT_UNDO_MAX_DEPTH;

	const undoManager = new Y.UndoManager([blockOrder, blocks], {
		trackedOrigins,
		captureTimeout: options?.captureTimeout ?? 0,
		doc: doc.ydoc,
	});

	(undoManager as unknown as Record<string, unknown>)[HISTORY_ORIGIN_TAG] =
		true;

	const trimStack = (stack: unknown[]) => {
		while (maxDepth >= 0 && stack.length > maxDepth) {
			stack.shift();
		}
	};

	undoManager.on(
		"stack-item-added",
		(event: { type: "undo" | "redo" }) => {
			trimStack(
				event.type === "undo"
					? undoManager.undoStack
					: undoManager.redoStack,
			);
		},
	);

	let destroyed = false;

	const wrapStackItem = (stackItem: {
		meta: Map<string, unknown>;
	}): CRDTUndoStackItem => ({
		getMeta<T>(key: string): T | undefined {
			return stackItem.meta.get(key) as T | undefined;
		},
		setMeta(key: string, value: unknown): void {
			stackItem.meta.set(key, value);
		},
	});

	return {
		addTrackedOrigin(origin) {
			undoManager.addTrackedOrigin(origin);
			if (typeof origin === "string") {
				const token = canonicalOrigin(origin as OpOriginType);
				if (token) undoManager.addTrackedOrigin(token);
			}
		},
		removeTrackedOrigin(origin) {
			undoManager.removeTrackedOrigin(origin);
			if (typeof origin === "string") {
				const token = canonicalOrigin(origin as OpOriginType);
				if (token) undoManager.removeTrackedOrigin(token);
			}
		},
		undo() {
			if (undoManager.undoStack.length === 0) return false;
			return withHistoryKind(undoManager, "undo", () => {
				undoManager.undo();
				return true;
			});
		},
		redo() {
			if (undoManager.redoStack.length === 0) return false;
			return withHistoryKind(undoManager, "redo", () => {
				undoManager.redo();
				return true;
			});
		},
		canUndo() {
			return undoManager.undoStack.length > 0;
		},
		canRedo() {
			return undoManager.redoStack.length > 0;
		},
		stopCapturing() {
			undoManager.stopCapturing();
		},
		setCaptureTimeout(ms) {
			(
				undoManager as Y.UndoManager & { captureTimeout?: number }
			).captureTimeout = ms;
		},
		onStackItemAdded(callback) {
			const handler = (event: {
				stackItem: { meta: Map<string, unknown> };
				type: "undo" | "redo";
			}) => {
				callback(wrapStackItem(event.stackItem), event.type);
			};

			undoManager.on("stack-item-added", handler);
			return () => {
				undoManager.off("stack-item-added", handler);
			};
		},
		onStackItemUpdated(callback) {
			const handler = (event: {
				stackItem: { meta: Map<string, unknown> };
				type: "undo" | "redo";
			}) => {
				callback(wrapStackItem(event.stackItem), event.type);
			};

			undoManager.on("stack-item-updated", handler);
			return () => {
				undoManager.off("stack-item-updated", handler);
			};
		},
		onStackItemPopped(callback) {
			const handler = (event: {
				stackItem: { meta: Map<string, unknown> };
				type: "undo" | "redo";
			}) => {
				callback(wrapStackItem(event.stackItem), event.type);
			};

			undoManager.on("stack-item-popped", handler);
			return () => {
				undoManager.off("stack-item-popped", handler);
			};
		},
		destroy() {
			if (destroyed) {
				return;
			}
			destroyed = true;
			undoManager.destroy();
		},
	};
}

function withHistoryKind(
	undoManager: Y.UndoManager,
	kind: "undo" | "redo",
	run: () => boolean,
): boolean {
	const target = undoManager as unknown as Record<string, unknown>;
	target[HISTORY_OPERATION_KIND] = kind;
	try {
		return run();
	} finally {
		delete target[HISTORY_OPERATION_KIND];
	}
}
