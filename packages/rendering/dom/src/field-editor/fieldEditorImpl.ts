import type {
	FieldEditor,
	Editor,
	BlockSchema,
	HistoryAppliedEvent,
	SelectionState,
	Unsubscribe,
} from "@pen/types";
import { DocumentRangeImpl } from "@pen/core";
import {
	hasFieldEditorSurface,
	resolveFieldEditorInputMode,
	usesInlineTextSelection,
} from "@pen/types";
import { EditContextBackend } from "./editContextBackend";
import { ContentEditableBackend } from "./contenteditableBackend";
import {
	BackendLifecycleController,
	type InputBackendConstructor,
} from "./backendLifecycleController";
import { CellEditingController } from "./cellEditingController";
import { ExpandedContentEditableBackend } from "./expandedContentEditableBackend";
import { FocusController } from "./focusController";
import { HistorySelectionCoordinator } from "./historySelectionCoordinator";
import { PendingMarkController } from "./pendingMarkController";
import { SelectAllController } from "./selectAllController";
import { FieldEditorSelectionCoordinator } from "./selectionCoordinator";
import type {
	FieldEditorSelectionSnapshot,
	FieldEditorSelectionSource,
} from "./selectionAuthority";
import { SessionReconciler } from "./sessionReconciler";
import { classifySelectionSurface } from "./crossBlock";
import type {
	ActiveCellCoord,
	FieldEditorFocusReason,
	FieldEditorInputController,
	FieldEditorSession,
	PenFieldEditorFocusOptions,
	PenFocusLifecycleEvent,
	PenFocusLifecycleListener,
	PenFocusPolicy,
} from "./controller";
import { getCellYText, getResolvedYText } from "./contentResolution";
import type { FieldEditorTextLike } from "./crdt";
import {
	domSelectionToEditor,
	queryBlockElement,
	queryInlineElement,
} from "./selectionBridge";
import {
	getEditorBlockSelectionLength,
	getEditorBlockSelectionRole,
} from "../utils/blockSelectionSemantics";
import {
	getEditorFlowCapability,
	shouldForceBlockScopedSelectAll,
} from "../utils/flowCapabilities";
import type { FieldEditorStoreSnapshot } from "./store";
import type { EditorSelectAllBehavior } from "../constants/selectAll";

type FieldEditorOptions = {
	selectAllBehavior?: EditorSelectAllBehavior;
	focusPolicy?: PenFocusPolicy;
};

export class FieldEditorImpl implements FieldEditorSession {
	private _focusBlockId: string | null = null;
	private _activeBlockIds: string[] = [];
	private _attachedElement: HTMLElement | null = null;
	private _isEditing = false;
	private _isFocused = false;
	private _isComposing = false;
	private _suppressNextBackendActivationFocus = false;
	private _inputMode: "richtext" | "code" | "table" | "none" = "none";
	private _mode: "inactive" | "single" | "expanded" | "block" = "inactive";
	private _editor: Editor;
	private _rootElement: HTMLElement | null = null;
	private _activateListeners = new Set<(blockIds: string[]) => void>();
	private _deactivateListeners = new Set<(blockIds: string[]) => void>();
	private _storeListeners = new Set<() => void>();
	private _unsubscribeSelection: Unsubscribe | null = null;
	private _unsubscribeHistoryApplied: Unsubscribe | null = null;
	private _domSyncVersion = 0;
	private readonly _sessionReconciler: SessionReconciler;
	private readonly _backendLifecycle: BackendLifecycleController;
	private readonly _focusController: FocusController;
	private readonly _cellEditingController: CellEditingController;
	private readonly _historySelectionCoordinator: HistorySelectionCoordinator;
	private readonly _pendingMarkController: PendingMarkController;
	private readonly _selectAllController: SelectAllController;
	private readonly _selectionCoordinator: FieldEditorSelectionCoordinator;

	constructor(editor: Editor, options?: FieldEditorOptions) {
		this._editor = editor;
		this._backendLifecycle = new BackendLifecycleController(
			this._editor,
			this,
		);
		this._selectAllController = new SelectAllController(
			options?.selectAllBehavior,
		);
		this._focusController = new FocusController({
			editor: this._editor,
			getRootElement: () => this._findEditorRoot(),
			getFocusBlockId: () => this._focusBlockId,
			getAttachedElement: () => this._attachedElement,
		});
		this._focusController.setFocusPolicy(options?.focusPolicy);
		this._cellEditingController = new CellEditingController({
			getRootElement: () => this._findEditorRoot(),
			getYTextForCell: (blockId, row, col) =>
				this._getYTextForCell(blockId, row, col),
			attachElement: (element) => this.attachElement(element),
			requestDomFocus: (target, reason, focusOptions, policyOptions) =>
				this.requestDomFocus(
					target,
					reason,
					focusOptions,
					policyOptions,
				),
		});
		this._pendingMarkController = new PendingMarkController({
			editor: this._editor,
			getFocusBlockId: () => this._focusBlockId,
			getYText: (blockId) => this._getYText(blockId),
			emitStateChange: () => this._emitStateChange(),
		});
		this._historySelectionCoordinator = new HistorySelectionCoordinator(
			this._editor,
		);
		this._selectionCoordinator = new FieldEditorSelectionCoordinator({
			historySelectionCoordinator: this._historySelectionCoordinator,
			isEditing: () => this._isEditing,
			getMode: () => this._mode,
			getFocusBlockId: () => this._focusBlockId,
			getAttachedElement: () => this._attachedElement,
			getRootElement: () => this._findEditorRoot(),
			findExpandedHost: () => this._findExpandedHost(),
			resolveInlineElement: (blockId) =>
				this._resolveInlineElement(blockId),
			attachElement: (element, focusOptions) =>
				this.attachElement(element, focusOptions),
			requestDomFocus: (target, reason, focusOptions, policyOptions) =>
				this.requestDomFocus(
					target,
					reason,
					focusOptions,
					policyOptions,
				),
			updateBackendSelection: () => {
				this._backendLifecycle.updateSelection(null);
			},
			setTextSelection: (blockId, anchorOffset, focusOffset) =>
				this.setTextSelection(blockId, anchorOffset, focusOffset),
			activate: (blockId) => this.activate(blockId),
			emitSelectionProjected: () => {
				this._emitFocusLifecycle({
					type: "selection-projected",
					editor: this._editor,
					blockId: this._focusBlockId,
				});
			},
		});
		this._unsubscribeSelection = this._editor.onSelectionChange(
			(selection) => {
				this._selectAllController.consumeShouldPreserveCycle(
					selection,
					(cycle, nextSelection) =>
						this._selectionMatchesSelectAllCycle(
							cycle,
							nextSelection,
						),
				);
				if (
					selection?.type !== "text" ||
					!selection.isCollapsed ||
					selection.isMultiBlock
				) {
					this._pendingMarkController.clear(true);
				}
				const suppressSelectionSync =
					this._selectionCoordinator.consumeDomSelectionProjectionSuppression() ||
					this._selectionCoordinator.shouldSuppressSelectionSync();
				this._recomputeSurfaceFromSelection({
					syncSelectionToBackend: !suppressSelectionSync,
				});
			},
		);
		this._unsubscribeHistoryApplied = this._editor.onHistoryApplied(
			(event) => {
				this._handleHistoryApplied(event);
			},
		);
		this._sessionReconciler = new SessionReconciler(this._editor, {
			getSnapshot: () => this.getSnapshot(),
			getAttachedElement: () => this._attachedElement,
			getInlineElement: (blockId) => this._resolveInlineElement(blockId),
			getYText: (blockId) => this._getYText(blockId),
			shouldPreserveSelection: () =>
				this._selectionCoordinator.shouldProjectSelectionAfterReconcile(),
			shouldProjectSelection: () =>
				this._selectionCoordinator.shouldProjectSelectionAfterReconcile(),
			projectSelection: () =>
				this._selectionCoordinator.syncDomSelectionOnce(),
			notifyDomReconciled: (blockId) => this.notifyDomReconciled(blockId),
		});
	}

	get focusBlockId(): string | null {
		return this._focusBlockId;
	}
	get activeBlockIds(): readonly string[] {
		return this._activeBlockIds;
	}
	get isEditing(): boolean {
		return this._isEditing;
	}
	get isFocused(): boolean {
		return this._isFocused;
	}
	get isComposing(): boolean {
		return this._isComposing;
	}
	get inputMode(): "richtext" | "code" | "table" | "none" {
		return this._inputMode;
	}
	get selection(): SelectionState | null {
		return this._isEditing ? this._editor.selection : null;
	}
	set selection(sel: SelectionState | null) {
		this._editor.setSelection(sel);
		this._emitStateChange();
	}
	get activeCellCoord(): ActiveCellCoord | null {
		return this._cellEditingController.activeCellCoord;
	}

	setSelectAllBehavior(behavior: EditorSelectAllBehavior): void {
		this._selectAllController.setBehavior(behavior);
	}

	setFocusPolicy(focusPolicy: PenFocusPolicy | undefined): void {
		this._focusController.setFocusPolicy(focusPolicy);
	}

	// ── Lifecycle ─────────────────────────────────────────────

	activate(blockId: string): void {
		if (this._focusBlockId === blockId) return;
		this._startSession(blockId, {
			stopCapturing: true,
			syncSelectionToBackend: true,
			attachImmediately: true,
		});
	}

	activateCell(blockId: string, row: number, col: number): void {
		this._activateCell(blockId, row, col);
		this._attachedElement = null;
		this._cellEditingController.trySyncBackend();
	}

	activateCellFromElement(
		blockId: string,
		row: number,
		col: number,
		element: HTMLElement,
	): void {
		this._activateCell(blockId, row, col);
		this.attachElement(element);
		this._cellEditingController.placeCaretInCell(element);
	}

	private _activateCell(blockId: string, row: number, col: number): void {
		this._cellEditingController.setActiveCell(blockId, row, col);
		if (!this._isEditing || this._focusBlockId !== blockId) {
			this._startSession(blockId, {
				stopCapturing: true,
				syncSelectionToBackend: false,
				attachImmediately: false,
			});
		}
		this._inputMode = "table";
		this._emitStateChange();
	}

	deactivate(): void {
		this._deactivate({ restoreFocus: true });
	}

	selectAll(rootElement?: HTMLElement | null): boolean {
		const activeCellElement = this._resolveActiveCellElement(rootElement);
		if (activeCellElement) {
			const activeCellBlockId =
				this._cellEditingController.activeCellCoord?.blockId ??
				this._resolveSelectAllBlockId(rootElement);
			const shouldSelectCellContents =
				!isDomSelectionCoveringElementContents(activeCellElement) ||
				!this._selectAllController.hasScope(activeCellBlockId, "cell");
			if (shouldSelectCellContents) {
				if (
					this._attachedElement !== activeCellElement ||
					!this._attachedElement?.isConnected
				) {
					this.attachElement(activeCellElement);
				}
				this._selectElementContents(activeCellElement);
				if (activeCellBlockId) {
					this._selectAllController.recordScope(
						activeCellBlockId,
						"cell",
					);
				}
				return true;
			}
		}

		if (this._selectAllController.getBehavior() === "document-first") {
			const activeBlockId = this._resolveSelectAllBlockId(rootElement);
			const activeCapability = activeBlockId
				? getEditorFlowCapability(this._editor, activeBlockId)
				: null;
			if (
				!shouldForceBlockScopedSelectAll(
					this._editor.documentProfile,
					activeCapability,
				)
			) {
				return this._selectEntireDocument();
			}
		}

		const blockId = this._resolveSelectAllBlockId(rootElement);
		if (blockId) {
			const blockLength = getEditorBlockSelectionLength(
				this._editor,
				blockId,
			);
			const blockRole = getEditorBlockSelectionRole(
				this._editor,
				blockId,
			);
			const shouldSelectDocument =
				blockLength === 0 ||
				this._selectAllController.hasScope(blockId, "block");
			const nextScope = shouldSelectDocument ? "document" : "block";
			if (nextScope === "block") {
				if (blockRole && blockRole !== "editable-inline") {
					this.deactivate();
					this._editor.selectBlock(blockId);
					this._selectAllController.recordScope(blockId, "block");
					return true;
				}
				this.commitProgrammaticTextSelection(blockId, 0, blockLength);
				this._selectAllController.recordScope(blockId, "block");
				return true;
			}
		}

		return this._selectEntireDocument(blockId ?? null);
	}

	private _selectEntireDocument(blockId?: string | null): boolean {
		const range = getFullDocumentTextRange(this._editor);
		if (!range) {
			return true;
		}

		if (range.start.blockId === range.end.blockId) {
			this.commitProgrammaticTextSelection(
				range.start.blockId,
				range.start.offset,
				range.end.offset,
			);
		} else {
			if (!this._isEditing) {
				this.activate(range.focusBlockId);
			}
			this._editor.selectTextRange(range.start, range.end);
		}
		this._recomputeSurfaceFromSelection();
		if (this._selectAllController.getBehavior() === "block-first") {
			this._selectAllController.recordScope(
				blockId ?? range.focusBlockId,
				"document",
			);
		}
		this._syncSelectionToDOM();
		return true;
	}

	suspendForPointerSelection(): void {
		if (this._isComposing) return;
		this._deactivate({ restoreFocus: false });
	}

	beginPointerSelection(): void {
		this._selectionCoordinator.beginPointerSelection();
	}

	endPointerSelection(): void {
		this._selectionCoordinator.endPointerSelection();
	}

	setComposing(composing: boolean): void {
		if (this._isComposing === composing) return;
		this._isComposing = composing;
		this._emitStateChange();
	}

	private _deactivate(options: { restoreFocus: boolean }): void {
		if (!this._isEditing) return;

		const blockIds = [...this._activeBlockIds];
		const focusTargetId = this._focusBlockId ?? blockIds[0] ?? null;
		this._backendLifecycle.deactivate();
		this._attachedElement = null;
		this._cellEditingController.clear();

		this._focusBlockId = null;
		this._activeBlockIds = [];
		this._isEditing = false;
		this._isComposing = false;
		this._historySelectionCoordinator.reset();
		this._selectionCoordinator.reset();
		this._inputMode = "none";
		this._mode = "inactive";
		this._pendingMarkController.reset();

		for (const cb of this._deactivateListeners) cb(blockIds);
		this._emitFocusLifecycle({
			type: "activation-changed",
			editor: this._editor,
			activeBlockIds: [],
			isEditing: false,
		});
		if (options.restoreFocus) {
			this._restoreFocusAfterDeactivate(focusTargetId);
		}
		this._emitStateChange();
	}

	focus(options: PenFieldEditorFocusOptions = {}): boolean {
		if (!this._isEditing || !this._focusBlockId) return false;
		const root = this._findEditorRoot();

		if (!root) return false;

		const blockEl = queryBlockElement(root, this._focusBlockId);
		const inlineEl = blockEl?.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;

		if (!inlineEl) return false;

		const selection = this._editor.selection;
		if (
			!this.requestDomFocus(
				inlineEl,
				"activate",
				{
					preventScroll: false,
				},
				options,
			)
		) {
			return false;
		}

		if (
			selection?.type === "text" &&
			selection.anchor.blockId === this._focusBlockId &&
			selection.focus.blockId === this._focusBlockId
		) {
			this._backendLifecycle.updateSelection(null);
			return true;
		}

		const nativeSelection = root.ownerDocument?.getSelection();
		if (!nativeSelection) return true;

		const range = root.ownerDocument.createRange();
		range.selectNodeContents(inlineEl);
		range.collapse(false);

		nativeSelection.removeAllRanges();
		nativeSelection.addRange(range);
		return true;
	}

	blur(): void {
		this._focusController.blur();
	}

	requestDomFocus(
		target: HTMLElement,
		reason: FieldEditorFocusReason,
		options?: FocusOptions,
		policyOptions: PenFieldEditorFocusOptions = {},
	): boolean {
		if (
			reason === "backend-activate" &&
			this._suppressNextBackendActivationFocus
		) {
			return true;
		}
		return this._focusController.requestDomFocus(
			target,
			reason,
			options,
			policyOptions,
		);
	}

	requestActivation(
		target: HTMLElement,
		reason: FieldEditorFocusReason,
		options: PenFieldEditorFocusOptions = {},
	): boolean {
		return this._focusController.requestActivation(target, reason, options);
	}

	requestRootFocus(
		target: HTMLElement,
		reason: FieldEditorFocusReason,
		options?: FocusOptions,
	): boolean {
		return this._focusController.requestRootFocus(target, reason, options);
	}

	setRootElement(element: HTMLElement | null): void {
		this._rootElement = element;
		if (element) {
			this._focusController.notifyRootAttached(element);
		}
		if (element && this._isEditing) {
			this._syncActiveElement(false);
		}
	}

	setFocused(focused: boolean): void {
		if (this._isFocused === focused) return;
		this._isFocused = focused;
		this._emitStateChange();
	}

	private _findEditorRoot(): HTMLElement | null {
		if (!this._rootElement?.isConnected) return null;
		return this._rootElement;
	}

	private _findExpandedHost(): HTMLElement | null {
		const root = this._findEditorRoot();
		if (!root) return null;
		return root.querySelector(
			"[data-pen-editor-blocks-host]",
		) as HTMLElement | null;
	}

	attachElement(
		element: HTMLElement,
		options: PenFieldEditorFocusOptions = {},
	): boolean {
		if (!this._focusBlockId) return false;
		if (this._attachedElement === element && this._backendLifecycle.current)
			return true;
		if (!this.requestActivation(element, "backend-attach", options))
			return false;
		this._emitFocusLifecycle({
			type: "backend-attach-started",
			editor: this._editor,
			target: element,
			blockId: this._focusBlockId,
		});
		this._backendLifecycle.replace(this._resolveBackendClass());

		const ytext = this._getYText(this._focusBlockId);
		if (!ytext) return false;

		this._suppressNextBackendActivationFocus =
			options.domFocus === false || options.passive === true;
		try {
			this._backendLifecycle.activate(element, ytext);
		} finally {
			this._suppressNextBackendActivationFocus = false;
		}
		this._attachedElement = element;
		this._emitFocusLifecycle({
			type: "backend-attach-completed",
			editor: this._editor,
			target: element,
			blockId: this._focusBlockId,
		});
		this._focusController.resolveAttachmentWaiters();
		return true;
	}

	syncTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		if (!this._isEditing) return;
		if (this._focusBlockId !== blockId) return;

		if (
			this._selectionCoordinator.prepareSyncedTextSelection(
				this._editor.selection,
				blockId,
				anchorOffset,
				focusOffset,
			) === "skip"
		) {
			return;
		}
		this.setTextSelection(blockId, anchorOffset, focusOffset);
	}

	applyDocumentTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): void {
		this._selectionCoordinator.recordUserSelectionIntent();
		this._selectionCoordinator.suppressNextDomSelectionProjection();

		if (!this._isEditing || !this._focusBlockId) {
			this._startSession(anchor.blockId, {
				stopCapturing: false,
				syncSelectionToBackend: false,
				attachImmediately: false,
			});
		} else {
			const blockRange = new DocumentRangeImpl(
				anchor,
				focus,
				this._editor.internals.doc,
			).blockRange;
			if (!blockRange.includes(this._focusBlockId)) {
				this._focusBlockId = anchor.blockId;
			}
		}

		this._editor.selectTextRange(anchor, focus);
		this._emitStateChange();
	}

	applyDomTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
		options?: {
			focusBlockId?: string;
		},
	): void {
		if (anchor.blockId !== focus.blockId) {
			this.applyDocumentTextSelection(anchor, focus);
			return;
		}

		const isProgrammaticDomSelection =
			this._selectionCoordinator.isProgrammaticDomTextSelection(
				anchor,
				focus,
			);
		if (!isProgrammaticDomSelection) {
			this._selectionCoordinator.recordUserSelectionIntent();
		}
		this._selectionCoordinator.suppressNextDomSelectionProjection();

		if (
			anchor.blockId === focus.blockId &&
			(!this._isEditing || this._focusBlockId !== anchor.blockId)
		) {
			this._startSession(anchor.blockId, {
				stopCapturing: false,
				syncSelectionToBackend: false,
				attachImmediately: false,
			});
		}

		if (anchor.blockId === focus.blockId) {
			this.setTextSelection(anchor.blockId, anchor.offset, focus.offset);
			return;
		}

		if (options?.focusBlockId) {
			this._focusBlockId = options.focusBlockId;
		}
		this._editor.selectTextRange(anchor, focus);
		this._emitStateChange();
	}

	shouldHandleDomSelectionChange(isApplyingSelection: number): boolean {
		return this._selectionCoordinator.shouldHandleDomSelectionChange(
			this._focusBlockId,
			isApplyingSelection,
		);
	}

	resetBackendSelectionAuthority(): void {
		this._selectionCoordinator.resetAuthority();
	}

	setBackendSelectionAuthority(
		source: FieldEditorSelectionSource,
		selection: FieldEditorSelectionSnapshot | null,
	): void {
		this._selectionCoordinator.setAuthoritySelection(source, selection);
	}

	getBackendSelectionAuthority(
		source: FieldEditorSelectionSource,
		blockId?: string | null,
	): FieldEditorSelectionSnapshot | null {
		return this._selectionCoordinator.getAuthoritySelection(
			source,
			blockId,
		);
	}

	hasBackendSelectionAuthority(source: FieldEditorSelectionSource): boolean {
		return this._selectionCoordinator.hasAuthoritySelection(source);
	}

	clearBackendSelectionAuthority(source: FieldEditorSelectionSource): void {
		this._selectionCoordinator.clearAuthoritySelection(source);
	}

	applyBackendSelectionUntilNextFrame(): void {
		this._selectionCoordinator.applySelectionUntilNextFrame();
	}

	getBackendSelectionApplicationDepth(): number {
		return this._selectionCoordinator.isApplyingSelection;
	}

	setEditContextSelectionSnapshot(
		selection: FieldEditorSelectionSnapshot | null,
	): void {
		this._selectionCoordinator.setEditContextSelection(selection);
	}

	getEditContextSelectionSnapshot(
		blockId?: string | null,
	): FieldEditorSelectionSnapshot | null {
		return this._selectionCoordinator.getEditContextSelection(blockId);
	}

	resolveProgrammaticInputRange(
		blockId: string | null,
		liveRange: { start: number; end: number } | null,
	): { start: number; end: number } | null {
		return this._selectionCoordinator.resolveProgrammaticInputRange(
			blockId,
			liveRange,
		);
	}

	shouldIgnoreDomTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): boolean {
		return this._selectionCoordinator.shouldIgnoreDomTextSelection(
			anchor,
			focus,
		);
	}

	setTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		if (anchorOffset !== focusOffset) {
			this._pendingMarkController.clear(true);
		}
		this._editor.selectText(blockId, anchorOffset, focusOffset);
		this._selectionCoordinator.notifyTextSelectionSet(
			blockId,
			anchorOffset,
			focusOffset,
		);
		this._emitStateChange();
	}

	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options?: PenFieldEditorFocusOptions,
	): void {
		this._selectionCoordinator.activateTextSelection(
			blockId,
			anchorOffset,
			focusOffset,
			options,
		);
	}

	async focusTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options: PenFieldEditorFocusOptions = {},
	): Promise<boolean> {
		this.commitProgrammaticTextSelection(
			blockId,
			anchorOffset,
			focusOffset,
			options,
		);
		const attached = await this.waitForAttachment(blockId);
		if (!attached) {
			return false;
		}
		if (options.domFocus === false || options.passive) {
			return true;
		}
		const focused = this.focus(options);
		this.commitProgrammaticTextSelection(
			blockId,
			anchorOffset,
			focusOffset,
		);
		return focused;
	}

	commitProgrammaticTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options?: PenFieldEditorFocusOptions,
	): void {
		this._selectionCoordinator.commitProgrammaticTextSelection(
			blockId,
			anchorOffset,
			focusOffset,
			options,
		);
	}

	collapseSelectionToFocus(): void {
		const selection = this._editor.selection;
		if (selection?.type !== "text") return;

		this._collapseAndProject(selection.focus);
	}

	collapseSelectionToAnchor(): void {
		const selection = this._editor.selection;
		if (selection?.type !== "text") return;

		this._collapseAndProject(selection.anchor);
	}

	collapseSelectionToPoint(point: { blockId: string; offset: number }): void {
		this._collapseAndProject(point);
	}

	private _collapseAndProject(point: {
		blockId: string;
		offset: number;
	}): void {
		this.setTextSelection(point.blockId, point.offset, point.offset);

		if (!this._isEditing || this._focusBlockId !== point.blockId) {
			this.activate(point.blockId);
		}

		this._selectionCoordinator.syncDomSelectionOnce();
	}

	delegate(blockSchema: BlockSchema): boolean {
		return hasFieldEditorSurface(blockSchema);
	}

	getPendingMarks(): Readonly<Record<string, unknown | null>> {
		return this._pendingMarkController.getSnapshot();
	}

	clearPendingMarks(): void {
		this._pendingMarkController.clear();
	}

	resetSelectAllCycle(): void {
		this._selectAllController.resetCycle();
	}

	private _syncSelectionToDOM(): void {
		if (!this._isEditing) return;
		this._selectionCoordinator.syncDomSelectionOnce();
	}

	private _resolveSelectAllBlockId(
		rootElement?: HTMLElement | null,
	): string | null {
		const selection = this._editor.selection;
		if (selection?.type === "text" && !selection.isMultiBlock) {
			return selection.focus.blockId;
		}
		if (
			this._selectAllController.getBehavior() === "block-first" &&
			selection?.type === "block" &&
			selection.blockIds.length === 1
		) {
			return selection.blockIds[0] ?? null;
		}
		if (selection?.type === "cell") {
			return selection.blockId;
		}

		if (this._focusBlockId) {
			return this._focusBlockId;
		}

		const root = rootElement ?? this._findEditorRoot();
		if (!root) {
			return null;
		}

		const domSelection = domSelectionToEditor(root);
		if (
			domSelection &&
			domSelection.anchor.blockId === domSelection.focus.blockId
		) {
			return domSelection.focus.blockId;
		}

		const activeElement = root.ownerDocument?.activeElement;
		if (activeElement instanceof HTMLElement) {
			return (
				activeElement
					.closest("[data-block-id]")
					?.getAttribute("data-block-id") ?? null
			);
		}

		return null;
	}

	private _selectionMatchesSelectAllCycle(
		cycle: { blockId: string; scope: "cell" | "block" | "document" },
		selection: SelectionState | null,
	): boolean {
		if (cycle.scope === "cell") {
			return (
				selection?.type === "cell" &&
				selection.blockId === cycle.blockId
			);
		}

		if (cycle.scope === "block") {
			const blockLength = getEditorBlockSelectionLength(
				this._editor,
				cycle.blockId,
			);
			const blockRole = getEditorBlockSelectionRole(
				this._editor,
				cycle.blockId,
			);
			if (blockRole && blockRole !== "editable-inline") {
				return (
					selection?.type === "block" &&
					selection.blockIds.length === 1 &&
					selection.blockIds[0] === cycle.blockId
				);
			}

			if (selection?.type !== "text") {
				return false;
			}
			return (
				!selection.isMultiBlock &&
				selection.anchor.blockId === cycle.blockId &&
				selection.focus.blockId === cycle.blockId &&
				Math.min(selection.anchor.offset, selection.focus.offset) ===
					0 &&
				Math.max(selection.anchor.offset, selection.focus.offset) ===
					blockLength
			);
		}

		const range = getFullDocumentTextRange(this._editor);
		if (!range) {
			return false;
		}

		if (selection?.type !== "text") {
			return false;
		}

		return (
			selection.isMultiBlock &&
			((pointsEqual(selection.anchor, range.start) &&
				pointsEqual(selection.focus, range.end)) ||
				(pointsEqual(selection.anchor, range.end) &&
					pointsEqual(selection.focus, range.start)))
		);
	}

	togglePendingMark(markType: string): boolean {
		return this._pendingMarkController.toggle(
			markType,
			this._isEditing,
			this._inputMode,
		);
	}

	resolveInsertMarks(
		ytext: FieldEditorTextLike,
		offset: number,
	): Record<string, unknown | null> | undefined {
		return this._pendingMarkController.resolveInsertMarks(ytext, offset);
	}

	// ── Cross-block expansion ────────────────────────────────

	expandTo(blockId: string): void {
		if (!this._isEditing || !this._focusBlockId) return;

		const selection = this._editor.selection;
		const anchor =
			selection?.type === "text" &&
			selection.blockRange.includes(this._focusBlockId)
				? selection.anchor
				: { blockId: this._focusBlockId, offset: 0 };
		const doc = this._editor.documentState;
		const activeIdx = doc.indexOf(this._focusBlockId);
		const targetIdx = doc.indexOf(blockId);
		if (activeIdx < 0 || targetIdx < 0) return;

		const targetOffset =
			targetIdx >= activeIdx
				? (this._editor.getBlock(blockId)?.length() ?? 0)
				: 0;

		this._editor.selectTextRange(anchor, {
			blockId,
			offset: targetOffset,
		});
	}

	contractToFocused(): void {
		if (!this._isEditing || !this._focusBlockId) return;

		const selection = this._editor.selection;
		if (selection?.type !== "text") return;

		this._editor.selectTextRange(selection.focus, selection.focus);
	}

	// ── Events ───────────────────────────────────────────────

	onActivate(cb: (blockIds: string[]) => void): Unsubscribe {
		this._activateListeners.add(cb);
		return () => this._activateListeners.delete(cb);
	}

	onDeactivate(cb: (blockIds: string[]) => void): Unsubscribe {
		this._deactivateListeners.add(cb);
		return () => this._deactivateListeners.delete(cb);
	}

	onFocusLifecycle(listener: PenFocusLifecycleListener): Unsubscribe {
		return this._focusController.onFocusLifecycle(listener);
	}

	onSelectionChange(cb: (sel: SelectionState) => void): Unsubscribe {
		return this._editor.onSelectionChange(cb);
	}

	getSnapshot(): FieldEditorStoreSnapshot {
		return {
			focusBlockId: this._focusBlockId,
			activeBlockIds: this._activeBlockIds,
			isEditing: this._isEditing,
			isFocused: this._isFocused,
			isComposing: this._isComposing,
			domSyncVersion: this._domSyncVersion,
			inputMode: this._inputMode,
			mode: this._mode,
			activeCellCoord: this._cellEditingController.activeCellCoord,
		};
	}

	notifyDomReconciled(_blockId?: string): void {
		this._domSyncVersion += 1;
		this._emitStateChange();
	}

	subscribe(callback: () => void): Unsubscribe {
		this._storeListeners.add(callback);
		return () => this._storeListeners.delete(callback);
	}

	waitForAttachment(blockId = this._focusBlockId): Promise<boolean> {
		return this._focusController.waitForAttachment(blockId);
	}

	destroy(): void {
		this._unsubscribeSelection?.();
		this._unsubscribeSelection = null;
		this._unsubscribeHistoryApplied?.();
		this._unsubscribeHistoryApplied = null;
		this._sessionReconciler.destroy();
		this._deactivate({ restoreFocus: false });
		this._activateListeners.clear();
		this._deactivateListeners.clear();
		this._storeListeners.clear();
		this._focusController.destroy();
	}

	// ── Internal ─────────────────────────────────────────────

	private _resolveBackendClass(): InputBackendConstructor {
		if (this._mode === "expanded") {
			return ExpandedContentEditableBackend as unknown as InputBackendConstructor;
		}
		if (this._cellEditingController.activeCellCoord) {
			return ContentEditableBackend;
		}
		if (
			"EditContext" in globalThis &&
			typeof (globalThis as typeof globalThis & { EditContext?: unknown })
				.EditContext === "function"
		) {
			return EditContextBackend;
		}
		return ContentEditableBackend;
	}

	private _syncActiveElement(focus: boolean): void {
		if (!this._focusBlockId) return;
		const inlineEl = this._resolveInlineElement(this._focusBlockId);
		if (!inlineEl) return;

		this.attachElement(inlineEl);
		if (focus) {
			this.focus();
		}
	}

	private _restoreFocusAfterDeactivate(blockId: string | null): void {
		this._focusController.restoreFocusAfterDeactivate(blockId);
	}

	private _emitStateChange(): void {
		for (const callback of this._storeListeners) {
			callback();
		}
	}

	private _emitFocusLifecycle(event: PenFocusLifecycleEvent): void {
		this._focusController.emitLifecycle(event);
	}

	private _recomputeSurfaceFromSelection(options?: {
		syncSelectionToBackend?: boolean;
	}): void {
		const surface = classifySelectionSurface(
			this._editor,
			this._editor.selection,
			this._focusBlockId,
			this._isEditing,
		);
		this._updateSurfaceState(surface.mode, surface.blockIds);
		if (options?.syncSelectionToBackend ?? true) {
			this._backendLifecycle.updateSelection(null);
		}
	}

	private _updateSurfaceState(
		mode: "inactive" | "single" | "expanded" | "block",
		blockIds: string[],
	): void {
		const modeChanged = this._mode !== mode;
		const blockIdsChanged = !areBlockIdsEqual(
			this._activeBlockIds,
			blockIds,
		);
		if (!modeChanged && !blockIdsChanged) return;
		this._mode = mode;
		this._activeBlockIds = blockIds;
		this._syncBackendForSurfaceMode();

		if (this._isEditing && blockIdsChanged) {
			for (const cb of this._activateListeners) cb([...blockIds]);
			this._emitFocusLifecycle({
				type: "activation-changed",
				editor: this._editor,
				activeBlockIds: [...blockIds],
				isEditing: true,
			});
		}

		this._emitStateChange();
	}

	private _syncBackendForSurfaceMode(): void {
		if (!this._isEditing || !this._focusBlockId) return;
		const NextBackendClass = this._resolveBackendClass();
		if (this._backendLifecycle.hasBackend(NextBackendClass)) {
			return;
		}

		this._backendLifecycle.replace(NextBackendClass);

		if (this._mode === "expanded") {
			const expandedHost = this._findExpandedHost();
			this._attachedElement = null;
			if (expandedHost) {
				this.attachElement(expandedHost);
			}
			return;
		}

		if (this._mode === "single") {
			const inlineEl = this._resolveInlineElement(this._focusBlockId);
			if (inlineEl) {
				this._attachedElement = null;
				this.attachElement(inlineEl);
				return;
			}
		}

		if (!this._attachedElement) return;

		const ytext = this._getYText(this._focusBlockId);
		if (!ytext) return;
		if (!this.requestActivation(this._attachedElement, "backend-attach")) {
			return;
		}

		this._backendLifecycle.activate(this._attachedElement, ytext);
	}

	private _startSession(
		blockId: string,
		options: {
			stopCapturing: boolean;
			syncSelectionToBackend: boolean;
			attachImmediately: boolean;
		},
	): boolean {
		if (this._isEditing) this._deactivate({ restoreFocus: false });

		const block = this._editor.getBlock(blockId);
		if (!block) return false;

		const schema = this._editor.schema.resolve(block.type);
		if (schema?.fieldEditor === "none") return false;

		this._focusBlockId = blockId;
		this._activeBlockIds = [blockId];
		this._isEditing = true;
		this._isComposing = false;
		this._mode = "single";
		this._pendingMarkController.reset();

		if (options.stopCapturing) {
			this._editor.undoManager.stopCapturing();
		}

		this._inputMode = resolveInputMode(schema);
		this._backendLifecycle.replace(this._resolveBackendClass());
		this._attachedElement = null;
		if (options.attachImmediately) {
			this._syncActiveElement(false);
		}
		this._recomputeSurfaceFromSelection({
			syncSelectionToBackend: options.syncSelectionToBackend,
		});

		for (const cb of this._activateListeners) cb([...this._activeBlockIds]);
		this._emitFocusLifecycle({
			type: "activation-changed",
			editor: this._editor,
			activeBlockIds: [...this._activeBlockIds],
			isEditing: true,
		});
		this._emitStateChange();
		return true;
	}

	private _handleHistoryApplied(event: HistoryAppliedEvent): void {
		const selection = event.selection;
		const nextFocusBlockId =
			event.focusBlockId ??
			(selection?.type === "text" ? selection.focus.blockId : null);
		if (selection?.type !== "text") {
			if (this._isEditing) {
				this._deactivate({ restoreFocus: false });
			}
			return;
		}

		if (!this._isEditing) {
			return;
		}

		if (nextFocusBlockId) {
			this._focusBlockId = nextFocusBlockId;
		}

		this._historySelectionCoordinator.beginDeferredProjection(
			event.requestId,
		);

		this._recomputeSurfaceFromSelection({
			syncSelectionToBackend: false,
		});
	}

	private _attachedElementOwnsFocus(): boolean {
		return this._focusController.attachedElementOwnsFocus();
	}

	private _resolveInlineElement(blockId: string): HTMLElement | null {
		const root = this._findEditorRoot();
		if (!root) return null;
		const cellElement =
			this._cellEditingController.resolveInlineElement(blockId);
		if (cellElement) return cellElement;
		return queryInlineElement(root, blockId);
	}

	private _getYText(blockId: string): FieldEditorTextLike | null {
		return getResolvedYText(
			this._editor,
			blockId,
			this._cellEditingController.activeCellCoord,
		);
	}

	private _getYTextForCell(
		blockId: string,
		row: number,
		col: number,
	): FieldEditorTextLike | null {
		return getCellYText(this._editor, blockId, row, col);
	}

	private _selectElementContents(element: HTMLElement): void {
		if (
			!this.requestDomFocus(element, "select-all", {
				preventScroll: true,
			})
		) {
			return;
		}
		const selection = element.ownerDocument?.getSelection();
		if (!selection) return;

		const range = element.ownerDocument.createRange();
		range.selectNodeContents(element);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	private _resolveActiveCellElement(
		rootElement?: HTMLElement | null,
	): HTMLElement | null {
		return this._cellEditingController.resolveActiveCellElement(
			rootElement,
		);
	}
}

function resolveInputMode(
	schema?: BlockSchema | null,
): "richtext" | "code" | "table" | "none" {
	return resolveFieldEditorInputMode(schema);
}

function isDomSelectionCoveringElementContents(element: HTMLElement): boolean {
	const selection = element.ownerDocument?.getSelection();
	if (!selection || selection.rangeCount === 0) {
		return false;
	}

	const range = selection.getRangeAt(0);
	if (
		!element.contains(range.startContainer) ||
		!element.contains(range.endContainer)
	) {
		return false;
	}

	const fullRange = element.ownerDocument.createRange();
	fullRange.selectNodeContents(element);
	return (
		range.compareBoundaryPoints(Range.START_TO_START, fullRange) === 0 &&
		range.compareBoundaryPoints(Range.END_TO_END, fullRange) === 0
	);
}

function areBlockIdsEqual(
	left: readonly string[],
	right: readonly string[],
): boolean {
	if (left.length !== right.length) return false;
	for (let i = 0; i < left.length; i++) {
		if (left[i] !== right[i]) return false;
	}
	return true;
}

function getFullDocumentTextRange(editor: Editor): {
	start: { blockId: string; offset: number };
	end: { blockId: string; offset: number };
	focusBlockId: string;
} | null {
	const blockOrder = editor.documentState.blockOrder;
	const firstBlockId = blockOrder[0];
	const lastBlockId = blockOrder[blockOrder.length - 1];
	if (!firstBlockId || !lastBlockId) {
		return null;
	}

	const focusBlockId =
		blockOrder.find((blockId) => {
			const block = editor.getBlock(blockId);
			if (!block) return false;
			const schema = editor.schema.resolve(block.type);
			return usesInlineTextSelection(schema);
		}) ?? firstBlockId;

	return {
		start: { blockId: firstBlockId, offset: 0 },
		end: {
			blockId: lastBlockId,
			offset: getEditorBlockSelectionLength(editor, lastBlockId),
		},
		focusBlockId,
	};
}

function pointsEqual(
	left: { blockId: string; offset: number },
	right: { blockId: string; offset: number },
): boolean {
	return left.blockId === right.blockId && left.offset === right.offset;
}
