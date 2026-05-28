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
import { FieldEditorImplSelection } from "./fieldEditorImplSelection";
import {
	areBlockIdsEqual,
	resolveInputMode,
} from "./fieldEditorImplHelpers";

export abstract class FieldEditorImplRuntime extends FieldEditorImplSelection {
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

	protected _resolveBackendClass(): InputBackendConstructor {
		if (this._mode === "expanded") {
			return ExpandedContentEditableBackend;
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

	protected _syncActiveElement(focus: boolean): void {
		if (!this._focusBlockId) return;
		const inlineEl = this._resolveInlineElement(this._focusBlockId);
		if (!inlineEl) return;

		this.attachElement(inlineEl);
		if (focus) {
			this.focus();
		}
	}

	protected _restoreFocusAfterDeactivate(blockId: string | null): void {
		this._focusController.restoreFocusAfterDeactivate(blockId);
	}

	protected _emitStateChange(): void {
		for (const callback of this._storeListeners) {
			callback();
		}
	}

	protected _emitFocusLifecycle(event: PenFocusLifecycleEvent): void {
		this._focusController.emitLifecycle(event);
	}

	protected _recomputeSurfaceFromSelection(options?: {
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

	protected _updateSurfaceState(
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

	protected _syncBackendForSurfaceMode(): void {
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

	protected _startSession(
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

	protected _handleHistoryApplied(event: HistoryAppliedEvent): void {
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

	protected _attachedElementOwnsFocus(): boolean {
		return this._focusController.attachedElementOwnsFocus();
	}

	protected _resolveInlineElement(blockId: string): HTMLElement | null {
		const root = this._findEditorRoot();
		if (!root) return null;
		const cellElement =
			this._cellEditingController.resolveInlineElement(blockId);
		if (cellElement) return cellElement;
		return queryInlineElement(root, blockId);
	}

	protected _getYText(blockId: string): FieldEditorTextLike | null {
		return getResolvedYText(
			this._editor,
			blockId,
			this._cellEditingController.activeCellCoord,
		);
	}

	protected _getYTextForCell(
		blockId: string,
		row: number,
		col: number,
	): FieldEditorTextLike | null {
		return getCellYText(this._editor, blockId, row, col);
	}

	protected _selectElementContents(element: HTMLElement): void {
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

	protected _resolveActiveCellElement(
		rootElement?: HTMLElement | null,
	): HTMLElement | null {
		return this._cellEditingController.resolveActiveCellElement(
			rootElement,
		);
	}
}
