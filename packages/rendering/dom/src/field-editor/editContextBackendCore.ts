import type { Editor, InlineDecoration } from "@pen/types";
import type { FieldEditorInputController } from "./controller";
import { fullReconcileToDOM, applyDeltaToDOM } from "./reconciler";
import {
	domSelectionToEditor,
	editorSelectionToDOM,
	getDirectionalSelectionOffsets,
} from "./selectionBridge";
import {
	collapsedSelectionOffset,
	rangesEqual,
	resolveEditContextKeyDownRange,
	resolveEditContextTextUpdateRange,
	type DirectionalSelectionOffsets,
	type EditContextRange,
	type EditContextSelection,
	type KeyDownRangeResolution,
} from "./editContextSelectionAuthority";
import {
	applyEditContextTextFormats,
	buildEditContextCharacterBounds,
	findTextPosition,
	isLogicallyEmptyText,
	isNavigationSelectionKey,
	shouldReplaceEditContextText,
	toEditContextText,
} from "./editContextDom";
import type {
	EditContext,
	EditContextCharacterBoundsUpdateEvent,
	EditContextGlobal,
	EditContextTextFormatUpdateEvent,
	EditContextTextUpdateEvent,
} from "./editContextTypes";
import { normalizeSelectionFormation } from "../utils/selectionFormation";
import { handleFieldEditorKeyDown } from "./keyHandling";
import { isHistoryTransactionOrigin } from "./historyOrigin";
import { handleCopy, handleCut, handleClipboardPaste } from "./clipboard";
import type { PasteImporters } from "../types/paste";
import { applyListInputRule } from "./commands";
import { isFieldEditorTextEditingKey } from "../utils/textEntryTarget";
import { applyInlineInputRule } from "./inlineInputRules";
import { applyInlineTextInput } from "./textInputPipeline";
import type {
	FieldEditorObserver,
	FieldEditorTextChangeEvent,
	FieldEditorTextLike,
} from "./crdt";

export type EditContextSelectionOptions = {
	source?: "text-update";
};

export abstract class EditContextBackendCore {
	protected editContext: EditContext | null = null;
	protected element: HTMLElement | null = null;
	protected ytext: FieldEditorTextLike | null = null;
	protected observer: FieldEditorObserver | null = null;
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
		this.fieldEditor.setComposing(false);

		const editContextConstructor = (globalThis as EditContextGlobal)
			.EditContext;
		if (!editContextConstructor) {
			throw new Error(
				"EditContext is not available in this environment.",
			);
		}

		const initialText = this.ytext.toString();
		const initialEditContextText = toEditContextText(initialText);
		const initialSelectionOffset = isLogicallyEmptyText(initialText)
			? 0
			: initialEditContextText.length;
		this.editContext = new editContextConstructor({
			text: initialEditContextText,
			selectionStart: initialSelectionOffset,
			selectionEnd: initialSelectionOffset,
		});

		const ec = this.editContext!;

		(
			element as HTMLElement & { editContext: EditContext | null }
		).editContext = ec;

		element.addEventListener("keydown", this.handleKeyDown);
		element.addEventListener("copy", this.handleCopyEvent);
		element.addEventListener("cut", this.handleCutEvent);
		element.addEventListener("paste", this.handlePasteEvent);
		element.addEventListener("dragstart", this.handleDragStart);
		element.addEventListener("drop", this.handleDrop);
		element.addEventListener("pointerdown", this.handlePointerDown);
		ec.addEventListener("textupdate", this.handleTextUpdate);
		ec.addEventListener("textformatupdate", this.handleTextFormatUpdate);
		ec.addEventListener(
			"characterboundsupdate",
			this.handleCharacterBoundsUpdate,
		);
		element.ownerDocument?.addEventListener(
			"selectionchange",
			this.handleSelectionChange,
		);

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
		this.fieldEditor.resetBackendSelectionAuthority();
		this.fieldEditor.applyBackendSelectionUntilNextFrame();
		this.updateSelection();
		this.fieldEditor.requestDomFocus(element, "backend-activate", {
			preventScroll: true,
		});
	}

	deactivate(): void {
		if (this.editContext) {
			this.editContext.removeEventListener(
				"textupdate",
				this.handleTextUpdate,
			);
			this.editContext.removeEventListener(
				"textformatupdate",
				this.handleTextFormatUpdate,
			);
			this.editContext.removeEventListener(
				"characterboundsupdate",
				this.handleCharacterBoundsUpdate,
			);
		}
		if (this.observer && this.ytext) {
			this.ytext.unobserve(this.observer);
		}
		this.unsubscribeDecorationsChange?.();
		this.unsubscribeDecorationsChange = null;
		if (this.element) {
			this.element.removeEventListener("keydown", this.handleKeyDown);
			this.element.removeEventListener("copy", this.handleCopyEvent);
			this.element.removeEventListener("cut", this.handleCutEvent);
			this.element.removeEventListener("paste", this.handlePasteEvent);
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
			(
				this.element as HTMLElement & {
					editContext: EditContext | null;
				}
			).editContext = null;
		}
		this.editContext = null;
		this.element = null;
		this.ytext = null;
		this.observer = null;
		this.inlineDecorationsSignature = null;
		this.fieldEditor.resetBackendSelectionAuthority();
		this.fieldEditor.setComposing(false);
	}

	updateSelection(): void {
		if (!this.editContext || !this.ytext) return;

		const selection = this.fieldEditor.selection;
		const blockId = this.fieldEditor.focusBlockId;
		if (
			selection?.type === "text" &&
			blockId &&
			selection.anchor.blockId === blockId &&
			selection.focus.blockId === blockId
		) {
			const anchorOffset = this.resolveEditContextOffset(
				selection.anchor.offset,
			);
			const focusOffset = this.resolveEditContextOffset(
				selection.focus.offset,
			);
			this.setEditContextSelection({
				blockId,
				anchorOffset,
				focusOffset,
			});
			this.fieldEditor.applyBackendSelectionUntilNextFrame();
			this.projectDOMSelection(blockId, anchorOffset, focusOffset);
			return;
		}

		const len = isLogicallyEmptyText(this.ytext.toString())
			? 0
			: this.ytext.length;
		this.editContext.updateSelection(len, len);
		this.fieldEditor.setEditContextSelectionSnapshot(
			blockId
				? {
						blockId,
						anchorOffset: len,
						focusOffset: len,
					}
				: null,
		);
	}

	protected projectDOMSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		if (!this.element) return;
		const root = this.element.closest(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		if (!root) return;
		editorSelectionToDOM(
			root,
			{ blockId, offset: anchorOffset },
			{ blockId, offset: focusOffset },
		);
	}

	protected abstract handleTextUpdate: (event: Event) => void;
	protected abstract handleTextFormatUpdate: (event: Event) => void;
	protected abstract handleCharacterBoundsUpdate: (event: Event) => void;
	protected abstract handleSelectionChange: () => void;
	protected abstract handleYTextChange: (event: FieldEditorTextChangeEvent) => void;
	protected abstract handleDecorationsChange: () => void;
	protected abstract handleKeyDown: (event: KeyboardEvent) => void;
	protected abstract handleCopyEvent: (event: ClipboardEvent) => void;
	protected abstract handleCutEvent: (event: ClipboardEvent) => void;
	protected abstract handlePasteEvent: (event: ClipboardEvent) => void;
	protected abstract handleDragStart: (event: DragEvent) => void;
	protected abstract handleDrop: (event: DragEvent) => void;
	protected abstract handlePointerDown: () => void;
	protected abstract restoreDOMCaret(): void;
	protected abstract getInlineDecorationsForBlock(): readonly InlineDecoration[];
	protected abstract getInlineDecorationsSignature(): string;
	protected abstract setEditContextSelection(
		selection: EditContextSelection,
		options?: EditContextSelectionOptions,
	): void;
	protected abstract resolveEditContextOffset(
		offset: number,
		options?: EditContextSelectionOptions,
	): number;
	protected abstract resolveCollapsedEditorSelectionRange(
		blockId: string,
	): EditContextRange | null;
	protected abstract getAuthoritativeTextInputSelection(
		blockId: string,
	): EditContextSelection | null;
}
