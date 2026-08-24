import type {
	EditorInternals,
	CreateEditorOptions,
	PenEventMap,
	DocumentCommitEvent,
	CRDTAdapter,
	CRDTDocument,
	CRDTEvent,
	PenDocument,
	SchemaRegistry,
	Awareness,
	DocumentSession,
	DocumentScope,
	DocumentScopeReplacementEvent,
	DocumentProfile,
	Extension,
	DocumentOp,
	ApplyOptions,
	OpOrigin,
	MutationGroupMetadata,
	SelectionState,
	TextSelection,
	DocumentRange,
	BlockHandle,
	Block,
	DocumentState,
	UndoManager,
	Unsubscribe,
	CRDTMap,
	CRDTArray,
	Position,
	DecorationSet,
	EditorViewMode,
} from "@input/pen-types";
import {
	AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
	COLLECT_KEY_BINDINGS_SLOT_KEY,
	MUTATION_GROUP_METADATA_KEY,
	UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY,
} from "@input/pen-types";
import { createMutationGroupMetadata, getApplyOptionsGroupId } from "./origin";
import { usesInlineTextSelection } from "../schema/fieldEditorCapabilities";
import {
	SLOT_DEPRECATED_CODE,
	dispositionForSlot,
} from "../facets/slotAdapter";
import { undoManagerFacet } from "../facets/controllerFacets";
import { getDocumentLoadReport } from "@input/pen-crdt-yjs";
import { SchemaEngineImpl } from "../schema/normalize";
import { createBlockHandle } from "../schema/handles";
import { resolveCellSelectionMatrix } from "./cellSelection";
import { filterOpsForDocumentProfile } from "./profilePolicy";
import type { CRDTUnknownMap } from "./crdtShapes";
import {
	getTextProp,
	getTableContent,
	getCellText as getCellTextFromRow,
	isCRDTMap,
} from "./crdtShapes";
import { createEmptyBlockIndex } from "../changes/blockIndex";
import { emptyDecorationSet } from "./decorations";
import { DocumentStateImpl } from "./documentState";
import { createDocumentSession } from "./documentSession";

type EditorImplRuntime = any;
type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;
type RawPenDocumentLike = {
	getArray?(name: "blockOrder"): CRDTArray<string>;
	getMap?(name: "blocks" | "apps" | "metadata"): CRDTMap<unknown>;
	blockOrder?: CRDTArray<string>;
	blocks?: CRDTMap<unknown>;
	apps?: CRDTMap<unknown>;
	metadata?: CRDTMap<unknown>;
};
function missingPenDocumentRoot(name: string): never {
	throw new Error(`CRDT document is missing required Pen root "${name}".`);
}

function readAdaptedSlot<T>(
	self: EditorImplRuntime,
	key: string,
): T | undefined {
	const disposition = dispositionForSlot(key);
	if (disposition?.kind === "whenReady") {
		return (() => self.whenReady()) as T;
	}
	if (disposition?.kind === "engine") {
		return self._engine as T;
	}
	if (self._slots.has(key)) {
		return self._slots.get(key) as T;
	}
	if (disposition?.kind === "facet") {
		return self._facetRegistry.read(disposition.facet) as T;
	}
	return undefined;
}

function writeAdaptedSlot(
	self: EditorImplRuntime,
	key: string,
	value: unknown,
	deprecated: boolean,
): void {
	self._slots.set(key, value);
	if (key === "undo:manager") {
		self._refreshUndoManager();
	}
	const disposition = dispositionForSlot(key);
	if (disposition?.kind === "facet") {
		self._facetRegistry.override(disposition.facet, value);
	}
	if (
		deprecated &&
		disposition &&
		(disposition.kind === "facet" || disposition.kind === "keymapCollector")
	) {
		warnSlotDeprecated(self, key);
	}
}

function warnSlotDeprecated(self: EditorImplRuntime, key: string): void {
	const warned: Set<string> = (self._slotDeprecationWarned ??= new Set());
	if (warned.has(key)) {
		return;
	}
	warned.add(key);
	self._emitter.emit("diagnostic", {
		code: SLOT_DEPRECATED_CODE,
		level: "warn",
		source: "facets",
		message: `getSlot/setSlot("${key}") is deprecated; use editor.facet()`,
		remediation:
			"Read the mapped facet from editor.facet() and stop calling setSlot for this key.",
		key,
	});
}

export function getRawBlockMap(
	editor: EditorImplRuntime,
	blockId: string,
): CRDTUnknownMap | null {
	const self = editor as EditorImplRuntime;
	const blockMap = (self._doc.blocks as CRDTBlockMap).get(blockId);
	return (blockMap as unknown as CRDTUnknownMap) ?? null;
}

export function getEditorInternals(editor: EditorImplRuntime): EditorInternals {
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
		hasListeners: (event) => self._emitter.has(event),
		onApplyBoundary: (hook) => self._pipeline.addApplyBoundaryHook(hook),
		onPipelinePhase: (listener) => self._onPipelinePhase(listener),
		getSlot: <T>(key: string): T | undefined => readAdaptedSlot(self, key),
		setSlot: (key: string, value: unknown): void => {
			writeAdaptedSlot(self, key, value, true);
		},
		assignSlot: (key: string, value: unknown): void => {
			writeAdaptedSlot(self, key, value, false);
		},
		getBlockText: (blockId: string): unknown => {
			const blockMap = self._getRawBlockMap(blockId);
			if (!blockMap) return null;
			return getTextProp(blockMap, "content");
		},
		getCellText: (blockId: string, row: number, col: number): unknown => {
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

export function applyEditorOps(
	editor: EditorImplRuntime,
	ops: DocumentOp[],
	options?: ApplyOptions,
): void {
	const self = editor as EditorImplRuntime;
	const origin = options?.origin ?? "user";
	const groupId = getApplyOptionsGroupId(origin, options);
	const undo = self._slots.get("undo:manager") as UndoManager | undefined;

	undo?.syncExplicitUndoGroup(groupId ?? null);

	if (options?.undoGroup && !groupId) {
		undo?.stopCapturing();
	}

	self._pipeline.apply(ops, origin, options?.structural);
	self._recordMutationGroupMetadata(origin, groupId);
}

export function recordMutationGroupMetadata(
	editor: EditorImplRuntime,
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

export function loadEditorDocument(
	editor: EditorImplRuntime,
	doc: CRDTDocument,
): void {
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
		const report = getDocumentLoadReport(doc);
		if (report?.state === "repaired") {
			self._emitter.emit("crdt:recovered", "repair");
		}
	});
}

export function* iterateBlocks(
	editor: EditorImplRuntime,
	type?: string,
): Iterable<BlockHandle> {
	const self = editor as EditorImplRuntime;
	const seen = new Set<string>();

	function* walk(id: string): Iterable<BlockHandle> {
		if (seen.has(id)) return;
		seen.add(id);
		const blockMap = (self._doc.blocks as CRDTBlockMap).get(id);
		if (!type || blockMap?.get("type") === type) {
			yield createBlockHandle(id, self._doc, self._crdtDoc, self._registry);
		}
		const children = blockMap?.get("children") as
			| CRDTArray<string>
			| undefined;
		if (!children) return;
		for (let i = 0; i < children.length; i++) {
			yield* walk(children.get(i));
		}
	}

	for (let i = 0; i < self._doc.blockOrder.length; i++) {
		yield* walk((self._doc.blockOrder as CRDTArray<string>).get(i) as string);
	}
}

export function getEditorBlock(
	editor: EditorImplRuntime,
	blockId: string,
): BlockHandle | null {
	const self = editor as EditorImplRuntime;
	if (!(self._doc.blocks as CRDTBlockMap).has(blockId)) return null;
	return createBlockHandle(blockId, self._doc, self._crdtDoc, self._registry);
}

export function getFirstBlock(editor: EditorImplRuntime): BlockHandle | null {
	const self = editor as EditorImplRuntime;
	if (self._doc.blockOrder.length === 0) return null;
	const id = (self._doc.blockOrder as CRDTArray<string>).get(0) as string;
	return createBlockHandle(id, self._doc, self._crdtDoc, self._registry);
}

export function getLastBlock(editor: EditorImplRuntime): BlockHandle | null {
	const self = editor as EditorImplRuntime;
	const len = self._doc.blockOrder.length;
	if (len === 0) return null;
	const id = (self._doc.blockOrder as CRDTArray<string>).get(
		len - 1,
	) as string;
	return createBlockHandle(id, self._doc, self._crdtDoc, self._registry);
}

export function getBlockCount(editor: EditorImplRuntime): number {
	let count = 0;
	for (const _block of iterateBlocks(editor)) {
		count += 1;
	}
	return count;
}

export function getEditorBlockRevision(
	editor: EditorImplRuntime,
	blockId: string,
): number {
	const self = editor as EditorImplRuntime;
	return self._blockRevisions.get(blockId) ?? 0;
}

export function destroyEditor(editor: EditorImplRuntime): Promise<void> {
	const self = editor as EditorImplRuntime;
	if (self._isDestroyed) {
		return self._extensionLifecycle;
	}
	self._isDestroyed = true;
	self._blockRevisions.clear();
	return self._queueExtensionLifecycle(async () => {
		await self._extensions.deactivateAll(self);
		self._teardownObservation();
		self._releaseSession?.();
		self._releaseSession = null;
		self._emitter.removeAllListeners();
		releaseDestroyedEditorCaches(self);
	});
}

function releaseDestroyedEditorCaches(self: EditorImplRuntime): void {
	self._decorations = emptyDecorationSet();
	self._pendingSummary = null;
	self._deferredCRDTEvent = null;
	self._lastChangeSummary = null;
	self._blockIndex = createEmptyBlockIndex();
	self._documentState.clear();
	self._slots.delete("undo:manager");
	self._facetRegistry.override(undoManagerFacet, null);
	self._refreshUndoManager();
}
