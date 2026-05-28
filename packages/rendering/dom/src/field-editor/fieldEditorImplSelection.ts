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
import { FieldEditorImplLifecycle } from "./fieldEditorImplLifecycle";
import {
	getFullDocumentTextRange,
	pointsEqual,
} from "./fieldEditorImplHelpers";

export abstract class FieldEditorImplSelection extends FieldEditorImplLifecycle {
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

	protected _collapseAndProject(point: {
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

	protected _syncSelectionToDOM(): void {
		if (!this._isEditing) return;
		this._selectionCoordinator.syncDomSelectionOnce();
	}

	protected _resolveSelectAllBlockId(
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

	protected _selectionMatchesSelectAllCycle(
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
}
