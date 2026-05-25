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


export function createPenDocumentForEditor(editor: EditorImplRuntime, crdtDoc: CRDTDocument): PenDocument {
	const self = editor as EditorImplRuntime;
const wrapped = crdtDoc as CRDTDocument & { penDocument?: PenDocument };
if (wrapped.penDocument) {
	return wrapped.penDocument;
}

const raw = (self._adapter.raw as <T>(doc: CRDTDocument) => T)<RawPenDocumentLike>(crdtDoc);
const blockOrder =
	(raw.getArray ? raw.getArray("blockOrder") : raw.blockOrder) ??
	missingPenDocumentRoot("blockOrder");
const blocks =
	(raw.getMap ? raw.getMap("blocks") : raw.blocks) ??
	missingPenDocumentRoot("blocks");
const apps =
	(raw.getMap ? raw.getMap("apps") : raw.apps) ??
	missingPenDocumentRoot("apps");
const metadata =
	(raw.getMap ? raw.getMap("metadata") : raw.metadata) ??
	missingPenDocumentRoot("metadata");
return {
	blockOrder,
	blocks,
	apps,
	metadata,
	adapter: self._adapter,
};
}

export function resolveEditorExtensions(editor: EditorImplRuntime, options: CreateEditorOptions): Extension[] {
	const self = editor as EditorImplRuntime;
const without = new Set(options.without ?? []);
if (without.size > 0 && !hasWarnedAboutWithoutOption) {
	hasWarnedAboutWithoutOption = true;
	console.warn(
		"Pen: createEditor({ without }) is deprecated. Prefer createEditor({ preset: defaultPreset(...) }) for default feature composition.",
	);
}
const defaultExtensions = options.preset?.resolve({
	schema: self._registry,
	documentProfile: self._documentProfile,
}).extensions ?? [
	documentOpsExtension(),
	deltaStreamExtension(),
	undoExtension(),
	richTextShortcutsExtension(),
];
const defaults = defaultExtensions.filter(
	(ext) => !without.has(ext.name),
);

const userExtensions = options.extensions ?? [];
return [...defaults, ...userExtensions];
}

export function installProfilePolicyHook(editor: EditorImplRuntime, ): void {
	const self = editor as EditorImplRuntime;
self._pipeline.setFinalBeforeApplyHook((ops: DocumentOp[]) =>
	self._enforceDocumentProfileBoundary(ops),
);
}

export function enforceDocumentProfileBoundary(editor: EditorImplRuntime, ops: DocumentOp[]): DocumentOp[] {
	const self = editor as EditorImplRuntime;
const result = filterOpsForDocumentProfile(
	ops,
	self._documentProfile,
	self._registry,
);

for (const violation of result.violations) {
	self._emitter.emit("diagnostic", {
		code: "PEN_PROFILE_001",
		level: "warn",
		source: "profile-policy",
		message:
			`profile-policy: dropped ${violation.op.type} for disallowed ` +
			`block type "${violation.blockType}" in ${violation.documentProfile} documents`,
		remediation:
			"Use a block type allowed by the active documentProfile or " +
			"change the documentProfile before applying structural mutations.",
		op: violation.op,
		blockType: violation.blockType,
		documentProfile: violation.documentProfile,
	});
}

return result.ops;
}

export function refreshCoreSlots(editor: EditorImplRuntime, ): void {
	const self = editor as EditorImplRuntime;
self._slots.set("core:engine", self._engine);
self._slots.set(
	AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
	() => self._extensionLifecycle,
);
self._slots.set(
	COLLECT_KEY_BINDINGS_SLOT_KEY,
	(registry: SchemaRegistry) =>
		self._extensions.collectKeyBindings(registry),
);
}

export function bindEditorSession(editor: EditorImplRuntime, session: DocumentSession, scopeId?: string): void {
	const self = editor as EditorImplRuntime;
self._bindScope(session, scopeId);
self._releaseSession = session.attachEditor({
	onScopeReplaced: (event) => {
		self._handleScopeReplacement(session, event);
	},
});
}

export function bindEditorScope(editor: EditorImplRuntime, session: DocumentSession, scopeId?: string): void {
	const self = editor as EditorImplRuntime;
self._documentSession = session;
const scope =
	(scopeId ? session.getScope(scopeId) : null) ?? session.rootScope;
self._documentScope = scope;
self._crdtDoc = scope.doc;
self._doc = self._createPenDocument(scope.doc);
self._awareness = session.getAwareness(scope.id);
}

export function handleEditorScopeReplacement(editor: EditorImplRuntime, 
	session: DocumentSession,
	event: DocumentScopeReplacementEvent,
): void {
	const self = editor as EditorImplRuntime;
if (event.previousScope.id !== self._documentScope.id) {
	return;
}
self._queueExtensionLifecycle(async () => {
	await self._extensions.deactivateAll(self);
	if (self._isDestroyed) {
		return;
	}
	self._teardownObservation();
	self._bindScope(session, event.scope.id);
	await self._rebindActiveScope();
});
}

export function resolveEditorDocumentProfile(editor: EditorImplRuntime, 
	requestedProfile?: DocumentProfile,
): DocumentProfile {
	const self = editor as EditorImplRuntime;
const persistedProfile =
	self._adapter.getDocumentProfile?.(self._crdtDoc) ?? null;
const resolvedProfile =
	persistedProfile ?? requestedProfile ?? "structured";
if (persistedProfile == null) {
	self._adapter.setDocumentProfile?.(self._crdtDoc, resolvedProfile);
}
return resolvedProfile;
}

export async function rebindActiveScope(editor: EditorImplRuntime, ): Promise<void> {
	const self = editor as EditorImplRuntime;
self._documentProfile = self._resolveDocumentProfile();
self._editorViewMode =
	self._explicitEditorViewMode ?? self._documentProfile;
self._clientId = self._adapter.getClientId(self._crdtDoc);

self._engine = new SchemaEngineImpl(
	self._registry,
	self._doc,
	self._crdtDoc,
);
self._selection.updateDocument(self._doc, self._crdtDoc);
self._pipeline.updateDocument(self._doc, self._crdtDoc, self._engine);
self._documentState.updateDocument(
	self._doc,
	self._crdtDoc,
	self._documentProfile,
);
self._pipeline._init((event: CRDTEvent) => {
	self._dispatchCRDTEvent(event);
});
self._refreshCoreSlots();

self._wireObservation();
await self._activateExtensions();
self._engine.normalizeAll();
self._refreshDecorations();
}

export function refreshUndoManager(editor: EditorImplRuntime, ): void {
	const self = editor as EditorImplRuntime;
const slotUndo = self._slots.get("undo:manager") as
	| UndoManager
	| undefined;
(self as { undoManager: UndoManager }).undoManager =
	slotUndo ?? NOOP_UNDO;
}

export async function activateEditorExtensions(editor: EditorImplRuntime, ): Promise<void> {
	const self = editor as EditorImplRuntime;
const activation = self._extensions.activateAll(self);
self._refreshUndoManager();
await activation;
self._refreshUndoManager();
}

export function queueExtensionLifecycle(editor: EditorImplRuntime, task: () => Promise<void>): void {
	const self = editor as EditorImplRuntime;
const runTask = async (): Promise<void> => {
	try {
		await task();
	} catch (error) {
		if (self._isDestroyed) {
			return;
		}
		self._emitter.emit("diagnostic", {
			code: "PEN_EXT_006",
			level: "error",
			source: "extension",
			message: "Editor extension lifecycle transition failed",
			remediation:
				"Inspect async extension activate/deactivate hooks involved in document reload or scope replacement and ensure they resolve safely.",
			error,
		});
	}
};

self._extensionLifecycle = self._extensionLifecycle.then(
	runTask,
	runTask,
);
}

export function ensureInitialParagraph(editor: EditorImplRuntime, ): void {
	const self = editor as EditorImplRuntime;
if (self._doc.blockOrder.length > 0) {
	return;
}

self.apply(
	[
		{
			type: "insert-block",
			blockId: createGeneratedBlockId(),
			blockType: "paragraph",
			props: {},
			position: "last",
		},
	],
	{ origin: "system" },
);
}

export function createCommitEvent(editor: EditorImplRuntime, event: CRDTEvent): DocumentCommitEvent {
	const self = editor as EditorImplRuntime;
const blockRevisions: Record<string, number> = {};
for (const blockId of event.affectedBlocks) {
	const nextRevision = (self._blockRevisions.get(blockId) ?? 0) + 1;
	self._blockRevisions.set(blockId, nextRevision);
	blockRevisions[blockId] = nextRevision;
}
self._commitId += 1;
return {
	commitId: self._commitId,
	ops: event.ops,
	origin: event.origin,
	affectedBlocks: [...event.affectedBlocks],
	blockRevisions,
	scope: self._documentScope,
};
}

export function dispatchCRDTEvent(editor: EditorImplRuntime, event: CRDTEvent): void {
	const self = editor as EditorImplRuntime;
self._syncDocumentProfileFromStorage();
const commitEvent = self._createCommitEvent(event);
self._documentState.incrementalUpdate(event.affectedBlocks);
self._extensions.dispatchObserve([event], self);
const previousDecorationGeneration = self._decorations.generation;
const nextDecorations = self._refreshDecorations();
if (nextDecorations.generation !== previousDecorationGeneration) {
	self._emitter.emit("decorationsChange", nextDecorations.generation);
}
self._emitter.emit("change", [event]);
self._emitter.emit("documentCommit", commitEvent);
}

export function syncDocumentProfileFromStorage(editor: EditorImplRuntime, ): void {
	const self = editor as EditorImplRuntime;
const persistedProfile =
	self._adapter.getDocumentProfile?.(self._crdtDoc) ?? null;
if (!persistedProfile || persistedProfile === self._documentProfile) {
	return;
}

self._documentProfile = persistedProfile;
if (self._explicitEditorViewMode == null) {
	self._editorViewMode = persistedProfile;
}
self._documentState.setDocumentProfile(persistedProfile);
}

export function wireEditorObservation(editor: EditorImplRuntime, ): void {
	const self = editor as EditorImplRuntime;
if (self._documentSession) {
	self._unsubObserve = self._documentSession.observe(
		self._documentScope.id,
		(event: CRDTEvent) => {
			if (self._pipeline.suppressObserver) return;
			self._dispatchCRDTEvent(event);
		},
	);
	return;
}

self._unsubObserve = self._adapter.observe(
	self._crdtDoc,
	(event: CRDTEvent) => {
		if (self._pipeline.suppressObserver) return;
		self._dispatchCRDTEvent(event);
	},
);
}

export function teardownEditorObservation(editor: EditorImplRuntime, ): void {
	const self = editor as EditorImplRuntime;
if (self._unsubObserve) {
	self._unsubObserve();
	self._unsubObserve = null;
}
}
