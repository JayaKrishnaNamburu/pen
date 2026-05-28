import type { Editor, InlineDecoration } from "@pen/types";
import type { FieldEditorInputController } from "./controller";
import { fullReconcileToDOM, applyDeltaToDOM } from "./reconciler";
import {
	computeTextDiff,
	domPointToOffset,
	domSelectionToEditor,
	editorSelectionToDOM,
	extractTextFromDOM,
	getSelectionOffsets,
} from "./selectionBridge";
import { normalizeSelectionFormation } from "../utils/selectionFormation";
import type { PasteImporters } from "../types/paste";
import { handlePaste, handleCopy, handleCut } from "./clipboard";
import {
	applyListInputRule,
	applyDeleteBehavior,
	applyEnterBehavior,
	toggleInlineMark,
} from "./commands";
import { handleFieldEditorKeyDown } from "./keyHandling";
import { isHistoryTransactionOrigin } from "./historyOrigin";
import type { InlineTextDiffOp } from "./inlineTextTransaction";
import {
	applyInlineTextDiffInput,
	applyInlineTextInput,
} from "./textInputPipeline";
import type {
	FieldEditorDelta,
	FieldEditorObserver,
	FieldEditorTextChangeEvent,
	FieldEditorTextLike,
} from "./crdt";
import { setSelectionOffsets } from "./contenteditableDomHelpers";

export abstract class ContentEditableBackendCore {
	protected element: HTMLElement | null = null;
	protected ytext: FieldEditorTextLike | null = null;
	protected observer: FieldEditorObserver | null = null;
	protected mutationObserver: MutationObserver | null = null;
	protected isComposing = false;
	protected compositionStartTimestamp = 0;
	protected compositionStartText: string | null = null;
	protected deferredRemoteDeltas: Array<{ delta: FieldEditorDelta[] }> = [];
	protected pendingDomSyncFrame: number | null = null;
	protected unsubscribeDecorationsChange: (() => void) | null = null;
	protected inlineDecorationsSignature: string | null = null;
	protected editor: Editor;
	protected fieldEditor: FieldEditorInputController;

	constructor(editor: Editor, fieldEditor: FieldEditorInputController) {
		this.editor = editor;
		this.fieldEditor = fieldEditor;
	}

	activate(element: HTMLElement, ytext: unknown): void {
		this.element = element;
		this.ytext = ytext as FieldEditorTextLike;

		element.contentEditable = "true";
		this.fieldEditor.resetBackendSelectionAuthority();
		this.fieldEditor.applyBackendSelectionUntilNextFrame();
		this.isComposing = false;
		this.compositionStartText = null;
		this.fieldEditor.setComposing(false);

		element.addEventListener("beforeinput", this.handleBeforeInput);
		element.addEventListener(
			"compositionstart",
			this.handleCompositionStart,
		);
		element.addEventListener("compositionend", this.handleCompositionEnd);
		element.addEventListener("keydown", this.handleKeyDown);
		element.addEventListener("copy", this.handleCopyEvent);
		element.addEventListener("cut", this.handleCutEvent);
		element.addEventListener("dragstart", this.handleDragStart);
		element.addEventListener("drop", this.handleDrop);
		element.addEventListener("pointerdown", this.handlePointerDown);
		element.ownerDocument?.addEventListener(
			"selectionchange",
			this.handleSelectionChange,
		);

		this.mutationObserver = new MutationObserver(this.handleMutations);
		this.mutationObserver.observe(element, {
			childList: true,
			subtree: true,
			characterData: true,
			characterDataOldValue: true,
		});

		this.observer = (event) => this.handleYTextChange(event);
		this.ytext.observe(this.observer);
		this.unsubscribeDecorationsChange = this.editor.on(
			"decorationsChange",
			this.handleDecorationsChange,
		);
		this.inlineDecorationsSignature = this.getInlineDecorationsSignature();

		fullReconcileToDOM(this.ytext, element, this.editor.schema, {
			inlineDecorations: this.getInlineDecorationsForBlock(),
		});
		this.fieldEditor.notifyDomReconciled(
			this.fieldEditor.focusBlockId ?? undefined,
		);
		this.restoreDOMSelectionFromEditor();
	}

	deactivate(): void {
		if (this.element) {
			this.element.contentEditable = "false";
			this.element.removeEventListener(
				"beforeinput",
				this.handleBeforeInput,
			);
			this.element.removeEventListener(
				"compositionstart",
				this.handleCompositionStart,
			);
			this.element.removeEventListener(
				"compositionend",
				this.handleCompositionEnd,
			);
			this.element.removeEventListener("keydown", this.handleKeyDown);
			this.element.removeEventListener("copy", this.handleCopyEvent);
			this.element.removeEventListener("cut", this.handleCutEvent);
			this.element.removeEventListener("dragstart", this.handleDragStart);
			this.element.removeEventListener("drop", this.handleDrop);
			this.element.removeEventListener(
				"pointerdown",
				this.handlePointerDown,
			);
			this.element.ownerDocument?.removeEventListener(
				"selectionchange",
				this.handleSelectionChange,
			);
		}
		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			this.mutationObserver = null;
		}
		if (this.pendingDomSyncFrame != null) {
			cancelAnimationFrame(this.pendingDomSyncFrame);
			this.pendingDomSyncFrame = null;
		}
		if (this.observer && this.ytext) {
			this.ytext.unobserve(this.observer);
		}
		this.unsubscribeDecorationsChange?.();
		this.unsubscribeDecorationsChange = null;
		this.element = null;
		this.ytext = null;
		this.observer = null;
		this.inlineDecorationsSignature = null;
		this.deferredRemoteDeltas = [];
		this.fieldEditor.resetBackendSelectionAuthority();
		this.isComposing = false;
		this.compositionStartText = null;
		this.fieldEditor.setComposing(false);
	}

	updateSelection(_relPos: unknown): void {
		this.restoreDOMSelectionFromEditor();
	}

	protected _getActiveCellCoord(blockId: string): {
		blockId: string;
		row: number;
		col: number;
	} | null {
		const coord = this.fieldEditor.activeCellCoord;
		if (!coord || coord.blockId !== blockId) {
			return null;
		}
		return coord;
	}

	applyInlineTextEdit(options: {
		blockId: string;
		range: { start: number; end: number };
		text: string;
		marks?: Record<string, unknown>;
	}): void {
		const { blockId, range, text, marks } = options;
		const cellCoord = this._getActiveCellCoord(blockId);
		applyInlineTextInput({
			editor: this.editor,
			fieldEditor: this.fieldEditor,
			blockId,
			range,
			text,
			marks,
			cellCoord,
		});
		this.ensureActiveDOMMatchesYText();
		this.restoreDOMSelectionFromEditor();
		this.scheduleActiveDOMMatchCheck();
		this.fieldEditor.clearBackendSelectionAuthority("programmatic");
	}

	applyListInputRule(options: {
		blockId: string;
		range: { start: number; end: number };
		text: string;
	}): boolean {
		const target = applyListInputRule(this.editor, options);
		if (!target) return false;

		this.fieldEditor.setBackendSelectionAuthority("programmatic", {
			blockId: target.blockId,
			anchorOffset: target.anchorOffset,
			focusOffset: target.focusOffset,
		});

		this.fieldEditor.syncTextSelection(
			target.blockId,
			target.anchorOffset,
			target.focusOffset,
		);
		this.restoreDOMSelectionFromEditor();
		this.fieldEditor.clearBackendSelectionAuthority("programmatic");
		return true;
	}

	restoreDOMSelectionFromEditor(): void {
		if (!this.element) return;

		const blockId = this.fieldEditor.focusBlockId;
		if (!blockId) return;
		const selection = this.editor.selection;

		const pendingSelection = this.fieldEditor.getBackendSelectionAuthority(
			"programmatic",
			blockId,
		);
		const activeCell = this._getActiveCellCoord(blockId);
		if (
			activeCell &&
			(!pendingSelection ||
				(pendingSelection.cell?.row === activeCell.row &&
					pendingSelection.cell?.col === activeCell.col))
		) {
			const activeSelection =
				pendingSelection ??
				this.fieldEditor.getBackendSelectionAuthority("cell", blockId) ??
				(selection?.type === "text" &&
				selection.anchor.blockId === blockId &&
				selection.focus.blockId === blockId
					? {
							anchorOffset: selection.anchor.offset,
							focusOffset: selection.focus.offset,
						}
					: null);
			if (!activeSelection) return;
			const start = activeSelection.anchorOffset;
			const end = activeSelection.focusOffset;
			this.fieldEditor.applyBackendSelectionUntilNextFrame();
			setSelectionOffsets(this.element, start, end);
			return;
		}
		const anchor =
			pendingSelection != null
				? {
						blockId: pendingSelection.blockId,
						offset: pendingSelection.anchorOffset,
					}
				: selection?.type === "text"
					? selection.anchor
					: null;
		const focus =
			pendingSelection != null
				? {
						blockId: pendingSelection.blockId,
						offset: pendingSelection.focusOffset,
					}
				: selection?.type === "text"
					? selection.focus
					: null;

		if (!anchor || !focus) return;
		if (anchor.blockId !== blockId || focus.blockId !== blockId) {
			return;
		}
		if (
			pendingSelection == null &&
			anchor.offset === focus.offset &&
			selection?.type === "text" &&
			selection.isCollapsed
		) {
			this.fieldEditor.setBackendSelectionAuthority("programmatic", {
				blockId,
				anchorOffset: anchor.offset,
				focusOffset: focus.offset,
			});
		}

		const root = this.element.closest(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		if (!root) return;

		this.fieldEditor.applyBackendSelectionUntilNextFrame();
		editorSelectionToDOM(root, anchor, focus);
	}

	protected abstract handleBeforeInput: (event: InputEvent) => void;
	protected abstract handleCompositionStart: () => void;
	protected abstract handleCompositionEnd: () => void;
	protected abstract handleKeyDown: (event: KeyboardEvent) => void;
	protected abstract handleCopyEvent: (event: ClipboardEvent) => void;
	protected abstract handleCutEvent: (event: ClipboardEvent) => void;
	protected abstract handleDragStart: (event: DragEvent) => void;
	protected abstract handleDrop: (event: DragEvent) => void;
	protected abstract handlePointerDown: () => void;
	protected abstract handleSelectionChange: () => void;
	protected abstract handleMutations: (mutations: MutationRecord[]) => void;
	protected abstract handleYTextChange(event: FieldEditorTextChangeEvent): void;
	protected abstract handleDecorationsChange: () => void;
	abstract resolveCurrentInputRange(): { start: number; end: number } | null;
	protected abstract applyTextDiffAsOps(
		blockId: string,
		diff: InlineTextDiffOp[],
	): void;
	protected abstract ensureActiveDOMMatchesYText(): boolean;
	protected abstract scheduleActiveDOMMatchCheck(): void;
	protected abstract getInlineDecorationsForBlock(): readonly InlineDecoration[];
	protected abstract getInlineDecorationsSignature(): string;
}
