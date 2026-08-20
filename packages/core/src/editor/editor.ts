import type { Editor, EditorInternals, CreateEditorOptions, PenEventMap, DocumentCommitEvent, CRDTAdapter, CRDTDocument, CRDTEvent, PenDocument, SchemaRegistry, Awareness, DocumentSession, DocumentScope, DocumentScopeReplacementEvent, DocumentProfile, Extension, DocumentOp, ApplyOptions, OpOrigin, MutationGroupMetadata, SelectionState, TextSelection, DocumentRange, BlockHandle, Block, DocumentState, UndoManager, Unsubscribe, CRDTMap, CRDTArray, Position, DecorationSet, EditorViewMode, ChangeSummary, SummaryLog, Facet, FacetOutput, PipelinePhase, SelectionRecord, OpenTextStreamOptions, TextStreamWriter } from "@input/pen-types";
import { AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY, COLLECT_KEY_BINDINGS_SLOT_KEY, usesInlineTextSelection, createMutationGroupMetadata, getApplyOptionsGroupId, MUTATION_GROUP_METADATA_KEY, UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY, generateId } from "@input/pen-types";
import { yjsAdapter } from "@input/pen-crdt-yjs";
import { undoExtension } from "@input/pen-undo";
import { documentOpsExtension } from "@input/pen-document-ops";
import { deltaStreamExtension } from "@input/pen-delta-stream";
import { richTextShortcutsExtension } from "@input/pen-shortcuts";
import { resolveEditorSchema } from "../schema/emptySchema";
import { SchemaEngineImpl } from "../schema/normalize";
import { createBlockHandle } from "../schema/handles";
import { EventEmitter } from "./events";
import { ApplyPipeline } from "./apply";
import { resolveCellSelectionMatrix } from "./cellSelection";
import { filterOpsForDocumentProfile } from "./profilePolicy";
import type { CRDTUnknownMap } from "./crdtShapes";
import { getTextProp, getTableContent, getCellText as getCellTextFromRow, isCRDTMap } from "./crdtShapes";
import { ExtensionManagerImpl } from "./extensionManager";
import { SelectionManagerImpl } from "./selection";
import { DocumentStateImpl } from "./documentState";
import { emptyDecorationSet } from "./decorations";
import { DocumentRangeImpl } from "./range";
import { createDocumentSession } from "./documentSession";

import { beforeApplyFacet } from "../facets/coreFacets";
import { a11yLabelFacet } from "../facets/a11yFacets";
import {
	localeFacet,
	messagesFacet,
	resolveEnvironmentLocale,
} from "../facets/i18nFacets";
import {
	createFacetRegistry,
	type FacetRegistry,
} from "../facets/registry";
import { v1ExtensionProviders } from "../facets/v1Providers";
import { getRawBlockMap, getEditorInternals, applyEditorOps, recordMutationGroupMetadata, loadEditorDocument, iterateBlocks, getEditorBlock, getFirstBlock, getLastBlock, getBlockCount, getEditorBlockRevision, destroyEditor } from "./editorApiHelpers";
import { createEmptyBlockIndex } from "../changes/blockIndex";
import { createSummaryLog } from "../changes/summaryLog";
import type { SummaryLog as CoreSummaryLog } from "../changes/summaryLog";
import { snapshotSelectionRecord } from "./commitEvent";
import { openEditorTextStream } from "./openTextStream";
import { createPenDocumentForEditor, resolveEditorExtensions, installProfilePolicyHook, enforceDocumentProfileBoundary, refreshCoreSlots, bindEditorSession, bindEditorScope, handleEditorScopeReplacement, resolveEditorDocumentProfile, rebindActiveScope, refreshUndoManager, activateEditorExtensions, queueExtensionLifecycle, ensureInitialParagraph, createCommitEvent, dispatchCRDTEvent, syncDocumentProfileFromStorage, wireEditorObservation, teardownEditorObservation } from "./editorLifecycle";
import { replaceEditorSelection, deleteEditorSelection, getTextForBlock, getSelectionRange, usesInlineTextSelectionForBlock, getBlockSelectionSpan, isWholeBlockSelection, collapseToPoint, sliceInlineDeltas, buildMultiBlockTextReplacement, deleteMultiBlockTextRange, replaceMultiBlockTextRange } from "./editorSelectionMutations";
type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;

// Stub undo manager for when @input/pen-undo is excluded
const NOOP_UNDO: UndoManager = { undo: () => false, redo: () => false, canUndo: () => false, canRedo: () => false, stopCapturing: () => {}, syncExplicitUndoGroup: () => {}, setGroupTimeout: () => {}, registerTrackedOrigins: () => () => {}, onStackChange: () => () => {} };

class EditorImpl implements Editor {
	private readonly _adapter: CRDTAdapter;
	private readonly _registry: SchemaRegistry;
	private _engine: SchemaEngineImpl;
	private readonly _extensions: ExtensionManagerImpl;
	private _selection: SelectionManagerImpl;
	private readonly _emitter: EventEmitter;
	private _pipeline: ApplyPipeline;
	private _documentState: DocumentStateImpl;
	private _doc!: PenDocument;
	private _crdtDoc!: CRDTDocument;
	private _documentSession: DocumentSession | null = null;
	private _documentScope!: DocumentScope;
	private _releaseSession: Unsubscribe | null = null;
	private _unsubObserve: Unsubscribe | null = null;
	private _awareness: Awareness | null = null;
	private readonly _slots = new Map<string, unknown>();
	private _clientId: number;
	private _documentProfile: DocumentProfile;
	private readonly _explicitEditorViewMode: EditorViewMode | null;
	private _editorViewMode: EditorViewMode;
	private _commitId = 0;
	private _summaryLog: CoreSummaryLog = createSummaryLog();
	private _blockIndex = createEmptyBlockIndex();
	private _unsubSummary: Unsubscribe | null = null;
	private _summaryCommitId = 0;
	private readonly _blockRevisions = new Map<string, number>();
	private _decorations: DecorationSet;
	private readonly _viewId = generateId();
	private _extensionLifecycle: Promise<void> = Promise.resolve();
	private _facetRegistry!: FacetRegistry;
	private _slotDeprecationWarned = new Set<string>();
	private _selectionVersion = 0;
	private _isDestroyed = false;
	private readonly _pipelinePhaseListeners: Array<(phase: PipelinePhase) => void> =
		[];
	private readonly _eventDeprecationWarned = new Set<string>();
	private _selectionBeforeRecord: SelectionRecord | null = null;

	readonly undoManager: UndoManager;

	constructor(options: CreateEditorOptions = {}) {
		this._registry = resolveEditorSchema(options);
		this._explicitEditorViewMode = options.editorViewMode ?? null;
		this._adapter =
			options.documentSession?.adapter ?? options.crdt ?? yjsAdapter();
		const documentSession =
			options.documentSession ??
			createDocumentSession({
				adapter: this._adapter,
				document: options.document,
				destroyWhenIdle: true,
				ownsDocuments: options.document == null,
			});
		this._bindSession(documentSession, options.documentScopeId);
		this._documentProfile = this._resolveDocumentProfile(
			options.documentProfile,
		);
		this._editorViewMode =
			this._explicitEditorViewMode ?? this._documentProfile;
		this._clientId = this._adapter.getClientId(this._crdtDoc);

		this._emitter = new EventEmitter();
		this._engine = new SchemaEngineImpl(
			this._registry,
			this._doc,
			this._crdtDoc,
		);
		this._selection = new SelectionManagerImpl(
			this._doc,
			this._crdtDoc,
			this._registry,
			this._emitter,
		);
		this._pipeline = new ApplyPipeline(
			this._doc,
			this._crdtDoc,
			this._adapter,
			this._registry,
			this._engine,
			this._emitter,
			this._selection,
		);
		this._documentState = new DocumentStateImpl(
			this._doc,
			this._crdtDoc,
			this._registry,
			this._documentProfile,
		);

		this._extensions = new ExtensionManagerImpl(this._emitter);
		const allExtensions = this._resolveExtensions(options);
		for (const ext of allExtensions) {
			this._extensions.register(ext);
		}
		const resolvedLocale = options.locale ?? resolveEnvironmentLocale();
		const i18nProviders = [
			localeFacet.of(
				resolvedLocale,
				options.locale != null ? "highest" : "lowest",
			),
		];
		if (options.messages) {
			i18nProviders.push(messagesFacet.of(options.messages, "highest"));
		}
		if (options.a11yLabel != null) {
			i18nProviders.push(a11yLabelFacet.of(options.a11yLabel, "highest"));
		}
		this._facetRegistry = createFacetRegistry({
			editor: this,
			extensions: allExtensions,
			providers: [...i18nProviders, ...v1ExtensionProviders(allExtensions)],
		});
		this._facetRegistry.markReady();

		this._pipeline._init(
			(event) => {
				this._dispatchCRDTEvent(event);
			},
			() => this._resolveBeforeApplyHooks(),
			(phase) => this._recordPipelinePhase(phase),
			() => this._captureSelectionBeforeForCommit(),
		);
		this._installProfilePolicyHook();

		this.undoManager = NOOP_UNDO;
		this._decorations = emptyDecorationSet();
		this._refreshCoreSlots();

		this._wireObservation();
		this._extensionLifecycle = this._activateExtensions();
		this._ensureInitialParagraph();

		this._engine.normalizeAll();
		this._refreshDecorations();
	}

	// ── Public API ───────────────────────────────────────────

	get clientId(): number {
		return this._clientId;
	}

	get documentScope(): DocumentScope {
		return this._documentScope;
	}

	get documentProfile(): DocumentProfile {
		return this._documentProfile;
	}

	get editorViewMode(): EditorViewMode {
		return this._editorViewMode;
	}

	get schema(): SchemaRegistry {
		return this._registry;
	}

	get selection(): SelectionState {
		return this._selection.getSelection();
	}

	get documentState(): DocumentState {
		return this._documentState;
	}

	private _getRawBlockMap(blockId: string): CRDTUnknownMap | null { return getRawBlockMap(this, blockId); }

	get internals(): EditorInternals { return getEditorInternals(this); }

	get summaryLog(): SummaryLog {
		return this._summaryLog;
	}

	get lastChangeSummary(): ChangeSummary | null {
		return this._summaryLog.latest();
	}

	// ── Mutations ────────────────────────────────────────────

	apply(ops: DocumentOp[], options?: ApplyOptions): void { applyEditorOps(this, ops, options); }

	openTextStream(
		target: { blockId: string },
		options: OpenTextStreamOptions,
	): TextStreamWriter {
		return openEditorTextStream(this, target, options, {
			runBeforeApplyHooks: (ops, origin) =>
				this._pipeline.runBeforeApplyHooks(ops, origin),
			deferBlock: (blockId) => {
				this._engine.deferBlock(blockId);
			},
			undeferBlock: (blockId) => {
				this._engine.undeferBlock(blockId);
			},
		});
	}

	private _recordMutationGroupMetadata(origin: OpOrigin, groupId: string | undefined): void { recordMutationGroupMetadata(this, origin, groupId); }

	loadDocument(doc: CRDTDocument): void { loadEditorDocument(this, doc); }

	onBeforeApply(
		hook: (ops: DocumentOp[], options: ApplyOptions) => DocumentOp[],
		options?: { priority?: number },
	): Unsubscribe {
		return this._pipeline.addBeforeApplyHook(
			hook,
			options?.priority ?? 500,
		);
	}

	facet<F extends Facet<unknown, unknown>>(facet: F): FacetOutput<F> {
		return this._facetRegistry.read(facet);
	}

	whenReady(): Promise<void> {
		return this._extensionLifecycle;
	}

	// ── Block Traversal ──────────────────────────────────────

	*blocks(type?: string): Iterable<BlockHandle> { yield* iterateBlocks(this, type); }

	getBlock(blockId: string): BlockHandle | null { return getEditorBlock(this, blockId); }

	firstBlock(): BlockHandle | null { return getFirstBlock(this); }

	lastBlock(): BlockHandle | null { return getLastBlock(this); }

	blockCount(): number { return getBlockCount(this); }

	getBlockRevision(blockId: string): number { return getEditorBlockRevision(this, blockId); }

	// ── Selection ────────────────────────────────────────────

	setSelection(selection: SelectionState): void {
		this._selection.setSelection(selection);
		this._selectionVersion += 1;
		this._facetRegistry.settle({
			selectionVersion: this._selectionVersion,
		});
	}

	getSelection(): SelectionState {
		return this._selection.getSelection();
	}

	selectBlock(blockId: string): void {
		this._selection.selectBlock(blockId);
	}

	selectBlocks(blockIds: string[]): void {
		this._selection.selectBlocks(blockIds);
	}

	selectCell(blockId: string, row: number, col: number): void {
		this._selection.selectCell(blockId, row, col);
	}

	selectCellRange(
		blockId: string,
		anchor: { row: number; col: number },
		head: { row: number; col: number },
	): void {
		this._selection.selectCellRange(blockId, anchor, head);
	}

	selectText(blockId: string, from: number, to: number): void {
		this._selection.selectText(blockId, from, to);
	}

	selectTextRange(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): void {
		this._selection.selectTextRange(anchor, focus);
	}

	selectAll(): void {
		this._selection.selectAll();
	}

	getSelectedText(): string {
		return this._selection.getSelectedText();
	}

	getSelectedBlocks(): BlockHandle[] {
		return this._selection.getSelectedBlocks();
	}

	replaceSelection(content: string | Block[]): void { replaceEditorSelection(this, content); }

	deleteSelection(options?: ApplyOptions): void { deleteEditorSelection(this, options); }

	// ── Decorations ──────────────────────────────────────────

	requestDecorationUpdate(): void {
		const decoSet = this._refreshDecorations();
		this._emitter.emit("decorationsChange", decoSet.generation);
	}

	getDecorations(): DecorationSet {
		return this._decorations;
	}

	// ── Events ───────────────────────────────────────────────

	on<K extends keyof PenEventMap>(
		event: K,
		handler: PenEventMap[K],
	): Unsubscribe;
	on(event: string, handler: (...args: unknown[]) => void): Unsubscribe;
	on(event: string, handler: (...args: unknown[]) => void): Unsubscribe {
		return this._emitter.on(event, handler);
	}

	private _refreshDecorations(): DecorationSet {
		this._decorations = this._extensions.collectDecorations(
			this._documentState,
			this,
		);
		return this._decorations;
	}

	onDocumentCommit(callback: PenEventMap["documentCommit"]): Unsubscribe {
		return this.on("documentCommit", callback);
	}

	onSelectionChange(callback: PenEventMap["selectionChange"]): Unsubscribe {
		return this.on("selectionChange", callback);
	}

	onHistoryApplied(callback: PenEventMap["historyApplied"]): Unsubscribe {
		return this.on("historyApplied", callback);
	}

	// ── Extension State ──────────────────────────────────────

	getExtensionState<T>(name: string): T | undefined {
		return this._extensions.getExtensionState<T>(name);
	}

	// ── Normalization ────────────────────────────────────────

	normalizeAll(): void {
		this._engine.normalizeAll();
	}

	// ── Destroy ──────────────────────────────────────────────

	destroy(): Promise<void> { return destroyEditor(this); }

	// ── Private ──────────────────────────────────────────────

	private _createPenDocument(crdtDoc: CRDTDocument): PenDocument { return createPenDocumentForEditor(this, crdtDoc); }

	private _resolveExtensions(options: CreateEditorOptions): Extension[] { return resolveEditorExtensions(this, options); }

	private _installProfilePolicyHook(): void { installProfilePolicyHook(this); }

	private _enforceDocumentProfileBoundary(ops: DocumentOp[]): DocumentOp[] { return enforceDocumentProfileBoundary(this, ops); }

	private _refreshCoreSlots(): void { refreshCoreSlots(this); }

	private _bindSession(session: DocumentSession, scopeId?: string): void { bindEditorSession(this, session, scopeId); }

	private _bindScope(session: DocumentSession, scopeId?: string): void { bindEditorScope(this, session, scopeId); }

	private _handleScopeReplacement(session: DocumentSession, event: DocumentScopeReplacementEvent): void { handleEditorScopeReplacement(this, session, event); }

	private _resolveDocumentProfile(requestedProfile?: DocumentProfile): DocumentProfile { return resolveEditorDocumentProfile(this, requestedProfile); }

	private async _rebindActiveScope(): Promise<void> { await rebindActiveScope(this); }

	private _refreshUndoManager(): void { refreshUndoManager(this); }

	private async _activateExtensions(): Promise<void> { await activateEditorExtensions(this); }

	private _queueExtensionLifecycle(task: () => Promise<void>): Promise<void> { return queueExtensionLifecycle(this, task); }

	private _ensureInitialParagraph(): void { ensureInitialParagraph(this); }

	private _createCommitEvent(event: CRDTEvent): DocumentCommitEvent { return createCommitEvent(this, event); }

	private _dispatchCRDTEvent(event: CRDTEvent): void { dispatchCRDTEvent(this, event); }

	private _recordPipelinePhase(phase: PipelinePhase): void {
		for (const listener of this._pipelinePhaseListeners) {
			listener(phase);
		}
	}

	private _onPipelinePhase(
		listener: (phase: PipelinePhase) => void,
	): Unsubscribe {
		this._pipelinePhaseListeners.push(listener);
		return () => {
			const index = this._pipelinePhaseListeners.indexOf(listener);
			if (index >= 0) {
				this._pipelinePhaseListeners.splice(index, 1);
			}
		};
	}

	private _captureSelectionBeforeForCommit(): void {
		this._selectionBeforeRecord = snapshotSelectionRecord(
			this.selection,
			this._selectionVersion,
			this._commitId,
		);
	}

	private _syncDocumentProfileFromStorage(): void { syncDocumentProfileFromStorage(this); }

	private _wireObservation(): void { wireEditorObservation(this); }

	private _teardownObservation(): void { teardownEditorObservation(this); }

	private _getTextForBlock(blockId: string): string { return getTextForBlock(this, blockId); }

	private _getSelectionRange(sel: TextSelection): DocumentRange { return getSelectionRange(this, sel); }

	private _usesInlineTextSelection(blockId: string): boolean { return usesInlineTextSelectionForBlock(this, blockId); }

	private _getBlockSelectionSpan(blockId: string): number { return getBlockSelectionSpan(this, blockId); }

	private _isWholeBlockSelection(blockId: string, startOffset: number, endOffset: number): boolean { return isWholeBlockSelection(this, blockId, startOffset, endOffset); }

	private _collapseToPoint(point: { blockId: string; offset: number }): void { return collapseToPoint(this, point); }

	private _sliceInlineDeltas(blockId: string, startOffset: number): Array<{ insert: string; attributes?: Record<string, unknown> }> { return sliceInlineDeltas(this, blockId, startOffset); }

	private _buildMultiBlockTextReplacement(range: DocumentRange, insertedText: string): { ops: DocumentOp[]; caret: { blockId: string; offset: number } } { return buildMultiBlockTextReplacement(this, range, insertedText); }

	private _deleteMultiBlockTextRange(range: DocumentRange, options?: ApplyOptions): { blockId: string; offset: number } | null { return deleteMultiBlockTextRange(this, range, options); }

	private _replaceMultiBlockTextRange(range: DocumentRange, text: string): { blockId: string; offset: number } { return replaceMultiBlockTextRange(this, range, text); }

	private _resolveBeforeApplyHooks(): ReadonlyArray<
		(ops: DocumentOp[], options: { origin?: OpOrigin }) => DocumentOp[]
	> {
		const registered = this._pipeline
			.getBeforeApplyHooks()
			.map((entry) => entry.hook);
		const registeredSet = new Set(registered);
		const extras = this._facetRegistry
			.read(beforeApplyFacet)
			.filter((hook) => !registeredSet.has(hook));
		return [...extras, ...registered];
	}

}

export function createEditor(options?: CreateEditorOptions): Editor {
	return new EditorImpl(options);
}

const headlessPreset = {
	resolve() {
		return { extensions: [] };
	},
};

export interface CreateHeadlessEditorOptions extends CreateEditorOptions {
	/**
	 * Headless server/workflow editors default to the core apply pipeline only.
	 * Enable default extensions when a host explicitly needs undo, shortcuts, or
	 * delta stream behavior in a non-rendered environment.
	 */
	useDefaultExtensions?: boolean;
}

export function createHeadlessEditor(
	options: CreateHeadlessEditorOptions = {},
): Editor {
	const { useDefaultExtensions = false, ...editorOptions } = options;
	return createEditor({
		...editorOptions,
		preset:
			editorOptions.preset ??
			(useDefaultExtensions ? undefined : headlessPreset),
	});
}
