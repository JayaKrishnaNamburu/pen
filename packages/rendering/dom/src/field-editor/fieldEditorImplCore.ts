import type {
	FieldEditor,
	Editor,
	BlockSchema,
	HistoryAppliedEvent,
	SelectionState,
	Unsubscribe,
} from "@pen/types";
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

export type FieldEditorOptions = {
	selectAllBehavior?: EditorSelectAllBehavior;
	focusPolicy?: PenFocusPolicy;
};

export abstract class FieldEditorImplCore {
	protected _focusBlockId: string | null = null;
	protected _activeBlockIds: string[] = [];
	protected _attachedElement: HTMLElement | null = null;
	protected _isEditing = false;
	protected _isFocused = false;
	protected _isComposing = false;
	protected _suppressNextBackendActivationFocus = false;
	protected _inputMode: "richtext" | "code" | "table" | "none" = "none";
	protected _mode: "inactive" | "single" | "expanded" | "block" = "inactive";
	protected _editor: Editor;
	protected _rootElement: HTMLElement | null = null;
	protected _activateListeners = new Set<(blockIds: string[]) => void>();
	protected _deactivateListeners = new Set<(blockIds: string[]) => void>();
	protected _storeListeners = new Set<() => void>();
	protected _unsubscribeSelection: Unsubscribe | null = null;
	protected _unsubscribeHistoryApplied: Unsubscribe | null = null;
	protected _domSyncVersion = 0;
	protected readonly _sessionReconciler: SessionReconciler;
	protected readonly _backendLifecycle: BackendLifecycleController;
	protected readonly _focusController: FocusController;
	protected readonly _cellEditingController: CellEditingController;
	protected readonly _historySelectionCoordinator: HistorySelectionCoordinator;
	protected readonly _pendingMarkController: PendingMarkController;
	protected readonly _selectAllController: SelectAllController;
	protected readonly _selectionCoordinator: FieldEditorSelectionCoordinator;

	constructor(editor: Editor, options?: FieldEditorOptions) {
		this._editor = editor;
		this._backendLifecycle = new BackendLifecycleController(
			this._editor,
			this as unknown as FieldEditorInputController,
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
	

	abstract activate(blockId: string): void;
	abstract attachElement(
		element: HTMLElement,
		options?: PenFieldEditorFocusOptions,
	): boolean;
	abstract requestDomFocus(
		target: HTMLElement,
		reason: FieldEditorFocusReason,
		options?: FocusOptions,
		policyOptions?: PenFieldEditorFocusOptions,
	): boolean;
	abstract setTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	abstract getSnapshot(): FieldEditorStoreSnapshot;

	abstract commitProgrammaticTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options?: PenFieldEditorFocusOptions,
	): void;
	abstract waitForAttachment(blockId?: string | null): Promise<boolean>;
	protected abstract _startSession(
		blockId: string,
		options: {
			stopCapturing: boolean;
			syncSelectionToBackend: boolean;
			attachImmediately: boolean;
		},
	): boolean;
	protected abstract _resolveActiveCellElement(
		rootElement?: HTMLElement | null,
	): HTMLElement | null;
	protected abstract _resolveSelectAllBlockId(
		rootElement?: HTMLElement | null,
	): string | null;
	protected abstract _selectElementContents(element: HTMLElement): void;
	protected abstract _syncSelectionToDOM(): void;
	protected abstract _restoreFocusAfterDeactivate(
		blockId: string | null,
	): void;
	protected abstract _syncActiveElement(focus: boolean): void;
	protected abstract _resolveBackendClass(): InputBackendConstructor;
	abstract notifyDomReconciled(blockId?: string): void;
	protected abstract _findEditorRoot(): HTMLElement | null;
	protected abstract _findExpandedHost(): HTMLElement | null;
	protected abstract _getYTextForCell(
		blockId: string,
		row: number,
		col: number,
	): FieldEditorTextLike | null;
	protected abstract _getYText(blockId: string): FieldEditorTextLike | null;
	protected abstract _resolveInlineElement(blockId: string): HTMLElement | null;
	protected abstract _emitStateChange(): void;
	protected abstract _emitFocusLifecycle(event: PenFocusLifecycleEvent): void;
	protected abstract _selectionMatchesSelectAllCycle(
		cycle: { blockId: string; scope: "cell" | "block" | "document" },
		selection: SelectionState | null,
	): boolean;
	protected abstract _recomputeSurfaceFromSelection(options?: {
		syncSelectionToBackend?: boolean;
	}): void;
	protected abstract _handleHistoryApplied(event: HistoryAppliedEvent): void;
}
