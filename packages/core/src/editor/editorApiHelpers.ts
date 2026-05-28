import type { EditorInternals, CreateEditorOptions, PenEventMap, DocumentCommitEvent, CRDTAdapter, CRDTDocument, CRDTEvent, PenDocument, SchemaRegistry, Awareness, DocumentSession, DocumentScope, DocumentScopeReplacementEvent, DocumentProfile, Extension, DocumentOp, ApplyOptions, OpOrigin, MutationGroupMetadata, SelectionState, TextSelection, DocumentRange, BlockHandle, Block, DocumentState, UndoManager, Unsubscribe, CRDTMap, CRDTArray, Position, DecorationSet, EditorViewMode } from "@pen/types";
import { AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY, COLLECT_KEY_BINDINGS_SLOT_KEY, usesInlineTextSelection, createMutationGroupMetadata, getApplyOptionsGroupId, MUTATION_GROUP_METADATA_KEY, UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY } from "@pen/types";
import { undoExtension } from "@pen/undo";
import { documentOpsExtension } from "@pen/document-ops";
import { deltaStreamExtension } from "@pen/delta-stream";
import { richTextShortcutsExtension } from "@pen/shortcuts";
import { SchemaEngineImpl } from "../schema/normalize";
import { createBlockHandle } from "../schema/handles";
import { resolveCellSelectionMatrix } from "./cellSelection";
import { filterOpsForDocumentProfile } from "./profilePolicy";
import type { CRDTUnknownMap } from "./crdtShapes";
import { getTextProp, getTableContent, getCellText as getCellTextFromRow, isCRDTMap } from "./crdtShapes";
import { DocumentStateImpl } from "./documentState";
import { createDocumentSession } from "./documentSession";

type EditorImplRuntime = any;
type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;
type RawPenDocumentLike = { getArray?(name: "blockOrder"): CRDTArray<string>; getMap?(name: "blocks" | "apps" | "metadata"): CRDTMap<unknown>; blockOrder?: CRDTArray<string>; blocks?: CRDTMap<unknown>; apps?: CRDTMap<unknown>; metadata?: CRDTMap<unknown>; };
function createGeneratedBlockId(): string { return crypto.randomUUID(); }
function missingPenDocumentRoot(name: string): never { throw new Error(`CRDT document is missing required Pen root "${name}".`); }
let hasWarnedAboutWithoutOption = false;
const NOOP_UNDO: UndoManager = { undo: () => false, redo: () => false, canUndo: () => false, canRedo: () => false, stopCapturing: () => {}, syncExplicitUndoGroup: () => {}, setGroupTimeout: () => {}, registerTrackedOrigins: () => () => {}, onStackChange: () => () => {} };


export function getRawBlockMap(editor: EditorImplRuntime, blockId: string): CRDTUnknownMap | null {
	const self = editor as EditorImplRuntime;
const blockMap = (self._doc.blocks as CRDTBlockMap).get(blockId);
return (blockMap as unknown as CRDTUnknownMap) ?? null;
}

export function getEditorInternals(editor: EditorImplRuntime, ): EditorInternals {
	const self = editor as EditorImplRuntime;
return {
	adapter: self._adapter,
	crdtDoc: self._crdtDoc,
	doc: self._doc,
	engine: self._engine,
	awareness: self._awareness,
	documentSession: self._documentSession,
	documentScope: self._documentScope,
	viewId: self._viewId,
	emit: (event, ...args) => {
		self._emitter.emit(event, ...args);
	},
	onApplyBoundary: (hook) =>
		self._pipeline.addApplyBoundaryHook(hook),
	getSlot: <T>(key: string): T | undefined =>
		self._slots.get(key) as T | undefined,
	setSlot: (key: string, value: unknown): void => {
		self._slots.set(key, value);
		if (key === "undo:manager") {
			self._refreshUndoManager();
		}
	},
	getBlockText: (blockId: string): unknown => {
		const blockMap = self._getRawBlockMap(blockId);
		if (!blockMap) return null;
		return getTextProp(blockMap, "content");
	},
	getCellText: (
		blockId: string,
		row: number,
		col: number,
	): unknown => {
		const blockMap = self._getRawBlockMap(blockId);
		if (!blockMap) return null;
		const tableContent = getTableContent(blockMap);
		if (!tableContent || row < 0 || row >= tableContent.length)
			return null;
		const rowMap = tableContent.get(row);
		if (!rowMap || !isCRDTMap(rowMap)) return null;
		return getCellTextFromRow(rowMap, col);
	},
};
}

export function applyEditorOps(editor: EditorImplRuntime, ops: DocumentOp[], options?: ApplyOptions): void {
	const self = editor as EditorImplRuntime;
const origin = options?.origin ?? "user";
const groupId = getApplyOptionsGroupId(origin, options);
const undo = self._slots.get("undo:manager") as UndoManager | undefined;

undo?.syncExplicitUndoGroup(groupId ?? null);

if (options?.undoGroup && !groupId) {
	undo?.stopCapturing();
}

self._pipeline.apply(ops, origin);
self._recordMutationGroupMetadata(origin, groupId);
}

export function recordMutationGroupMetadata(editor: EditorImplRuntime, 
	origin: OpOrigin,
	groupId: string | undefined,
): void {
	const self = editor as EditorImplRuntime;
if (!groupId) {
	return;
}
const controller = self._slots.get(
	UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY,
) as
	| {
			setCurrentEntryMetadata<T>(
				key: string,
				value: { before: T | null; after: T | null },
			): boolean;
	  }
	| undefined;
controller?.setCurrentEntryMetadata<MutationGroupMetadata>(
	MUTATION_GROUP_METADATA_KEY,
	{
		before: null,
		after: createMutationGroupMetadata(origin, groupId),
	},
);
}

export function loadEditorDocument(editor: EditorImplRuntime, doc: CRDTDocument): void {
	const self = editor as EditorImplRuntime;
self._queueExtensionLifecycle(async () => {
	await self._extensions.deactivateAll(self);
	if (self._isDestroyed) {
		return;
	}
	self._teardownObservation();
	self._releaseSession?.();
	self._releaseSession = null;
	self._bindSession(
		createDocumentSession({
			adapter: self._adapter,
			document: doc,
			destroyWhenIdle: true,
			ownsDocuments: false,
		}),
	);
	await self._rebindActiveScope();
});
}

export function* iterateBlocks(editor: EditorImplRuntime, type?: string): Iterable<BlockHandle> {
	const self = editor as EditorImplRuntime;
for (let i = 0; i < self._doc.blockOrder.length; i++) {
	const id = (self._doc.blockOrder as CRDTArray<string>).get(
		i,
	) as string;
	if (type) {
		const blockMap = (self._doc.blocks as CRDTBlockMap).get(id);
		if (!blockMap || blockMap.get("type") !== type) continue;
	}
	yield createBlockHandle(
		id,
		self._doc,
		self._crdtDoc,
		self._registry,
	);
}
}

export function getEditorBlock(editor: EditorImplRuntime, blockId: string): BlockHandle | null {
	const self = editor as EditorImplRuntime;
if (!(self._doc.blocks as CRDTBlockMap).has(blockId)) return null;
return createBlockHandle(
	blockId,
	self._doc,
	self._crdtDoc,
	self._registry,
);
}

export function getFirstBlock(editor: EditorImplRuntime, ): BlockHandle | null {
	const self = editor as EditorImplRuntime;
if (self._doc.blockOrder.length === 0) return null;
const id = (self._doc.blockOrder as CRDTArray<string>).get(0) as string;
return createBlockHandle(id, self._doc, self._crdtDoc, self._registry);
}

export function getLastBlock(editor: EditorImplRuntime, ): BlockHandle | null {
	const self = editor as EditorImplRuntime;
const len = self._doc.blockOrder.length;
if (len === 0) return null;
const id = (self._doc.blockOrder as CRDTArray<string>).get(
	len - 1,
) as string;
return createBlockHandle(id, self._doc, self._crdtDoc, self._registry);
}

export function getBlockCount(editor: EditorImplRuntime, ): number {
	const self = editor as EditorImplRuntime;
return self._doc.blockOrder.length;
}

export function getEditorBlockRevision(editor: EditorImplRuntime, blockId: string): number {
	const self = editor as EditorImplRuntime;
return self._blockRevisions.get(blockId) ?? 0;
}

export function destroyEditor(editor: EditorImplRuntime, ): void {
	const self = editor as EditorImplRuntime;
if (self._isDestroyed) {
	return;
}
self._isDestroyed = true;
self._queueExtensionLifecycle(async () => {
	await self._extensions.deactivateAll(self);
	self._teardownObservation();
	self._releaseSession?.();
	self._releaseSession = null;
	self._emitter.removeAllListeners();
});
}
