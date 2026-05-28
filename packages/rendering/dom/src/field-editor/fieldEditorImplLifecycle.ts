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
import { FieldEditorImplCore } from "./fieldEditorImplCore";
import {
	getFullDocumentTextRange,
	isDomSelectionCoveringElementContents,
} from "./fieldEditorImplHelpers";

export abstract class FieldEditorImplLifecycle extends FieldEditorImplCore {
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

	protected _activateCell(blockId: string, row: number, col: number): void {
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

	protected _selectEntireDocument(blockId?: string | null): boolean {
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

	protected _deactivate(options: { restoreFocus: boolean }): void {
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

	protected _findEditorRoot(): HTMLElement | null {
		if (!this._rootElement?.isConnected) return null;
		return this._rootElement;
	}

	protected _findExpandedHost(): HTMLElement | null {
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
}
