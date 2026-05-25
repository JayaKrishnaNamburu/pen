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
import { EditContextBackendSelection } from "./editContextBackendSelection";

export class EditContextBackendRuntime extends EditContextBackendSelection {
	protected handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.editContext || !this.element || !this.ytext) return;
		if (isNavigationSelectionKey(event)) {
			this.fieldEditor.clearBackendSelectionAuthority(
				"edit-context-textupdate",
			);
		}

		const blockId = this.fieldEditor.focusBlockId;
		const liveDomOffsets = getDirectionalSelectionOffsets(this.element);
		const { range, nextSelection, shouldSyncEditContextSelection } =
			this.resolveKeyDownRange(blockId, event, liveDomOffsets);

		if (shouldSyncEditContextSelection) {
			this.editContext.updateSelection(range.start, range.end);
			this.fieldEditor.setEditContextSelectionSnapshot(nextSelection);
		}

		const handled = handleFieldEditorKeyDown({
			event,
			editor: this.editor,
			fieldEditor: this.fieldEditor,
			ytext: this.ytext,
			range,
		});
		if (handled) {
			event.preventDefault();
		}
	};

	protected resolveKeyDownRange(
		blockId: string | null,
		event: KeyboardEvent,
		liveDomOffsets: DirectionalSelectionOffsets | null,
	): KeyDownRangeResolution {
		const isTextEditingKey = isFieldEditorTextEditingKey(event);
		const liveRange = liveDomOffsets
			? {
					start: liveDomOffsets.start,
					end: liveDomOffsets.end,
				}
			: null;
		return resolveEditContextKeyDownRange({
			blockId,
			isTextEditingKey,
			liveDomOffsets,
			editContextRange: this.resolveEditContextSelectionRange(),
			editorSelectionRange: blockId
				? this.resolveEditorSelectionRange(blockId)
				: null,
			programmaticInputRange:
				blockId && isTextEditingKey
					? this.fieldEditor.resolveProgrammaticInputRange(
							blockId,
							liveRange,
						)
					: null,
			authoritativeTextInputSelection: blockId
				? this.getAuthoritativeTextInputSelection(blockId)
				: null,
			collapsedEditorSelectionRange: blockId
				? this.resolveCollapsedEditorSelectionRange(blockId)
				: null,
			projectedTextSelection: blockId
				? this.getProjectedTextSelection(blockId)
				: null,
			synchronizedEditContextRange: blockId
				? this.resolveSynchronizedEditContextRange(blockId)
				: null,
		});
	}

	protected resolveEditContextSelectionRange(): EditContextRange {
		if (!this.editContext) {
			return { start: 0, end: 0 };
		}

		return {
			start: Math.min(
				this.editContext.selectionStart,
				this.editContext.selectionEnd,
			),
			end: Math.max(
				this.editContext.selectionStart,
				this.editContext.selectionEnd,
			),
		};
	}

	protected getProjectedTextSelection(
		blockId: string,
	): EditContextSelection | null {
		return this.fieldEditor.getEditContextSelectionSnapshot(blockId);
	}

	protected resolveCollapsedEditorSelectionRange(
		blockId: string,
	): EditContextRange | null {
		const selection = this.fieldEditor.selection;
		if (
			selection?.type === "text" &&
			selection.isCollapsed &&
			selection.focus.blockId === blockId
		) {
			return {
				start: selection.focus.offset,
				end: selection.focus.offset,
			};
		}

		return null;
	}

	protected resolveSynchronizedEditContextRange(
		blockId: string,
	): EditContextRange | null {
		if (!this.editContext) {
			return null;
		}

		const editContextRange = {
			start: Math.min(
				this.editContext.selectionStart,
				this.editContext.selectionEnd,
			),
			end: Math.max(
				this.editContext.selectionStart,
				this.editContext.selectionEnd,
			),
		};
		const editorRange =
			this.resolveEditorSelectionRange(blockId) ??
			this.resolveCollapsedEditorSelectionRange(blockId);

		if (editorRange && rangesEqual(editContextRange, editorRange)) {
			return editContextRange;
		}

		return null;
	}

	protected handleCopyEvent = (event: ClipboardEvent): void => {
		event.preventDefault();
		handleCopy(this.editor, event);
	};

	protected handleCutEvent = (event: ClipboardEvent): void => {
		event.preventDefault();
		handleCut(this.editor, event);
	};

	protected handlePasteEvent = (event: ClipboardEvent): void => {
		event.preventDefault();
		const importers =
			this.editor.internals.getSlot<PasteImporters>("paste:importers");
		handleClipboardPaste(
			event,
			this.editor,
			this.fieldEditor,
			importers ?? undefined,
		);
	};

	protected handleDragStart = (event: DragEvent): void => {
		event.preventDefault();
	};

	protected handleDrop = (event: DragEvent): void => {
		event.preventDefault();
	};

	protected handlePointerDown = (): void => {
		this.fieldEditor.clearBackendSelectionAuthority(
			"edit-context-textupdate",
		);
	};

	protected getAuthoritativeTextInputSelection(
		blockId: string,
	): EditContextSelection | null {
		const selection =
			this.fieldEditor.getBackendSelectionAuthority(
				"edit-context-textupdate",
				blockId,
			);
		if (!selection || selection.anchorOffset !== selection.focusOffset) {
			return null;
		}
		return {
			blockId: selection.blockId,
			anchorOffset: selection.anchorOffset,
			focusOffset: selection.focusOffset,
		};
	}
}
