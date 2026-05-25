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
import { EditContextBackendInput } from "./editContextBackendInput";

export abstract class EditContextBackendSelection extends EditContextBackendInput {
	protected handleSelectionChange = (): void => {
		if (!this.element || !this.editContext) return;
		const isApplyingSelection =
			this.fieldEditor.getBackendSelectionApplicationDepth();
		if (
			!this.fieldEditor.shouldHandleDomSelectionChange(
				isApplyingSelection,
			)
		) {
			if (isApplyingSelection === 0) {
				this.restoreDOMCaret();
			}
			return;
		}

		const root = this.element.closest(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		if (!root) return;

		const mappedSelection = domSelectionToEditor(root);
		if (!mappedSelection) return;
		const normalizedSelection = normalizeSelectionFormation(
			this.editor,
			mappedSelection,
		);

		if (this.shouldIgnoreStaleCollapsedDomSelection(normalizedSelection)) {
			this.restoreDOMCaret();
			return;
		}

		if (normalizedSelection.type === "block") {
			this.fieldEditor.deactivate();
			this.editor.setSelection({
				type: "block",
				blockIds: normalizedSelection.blockIds,
			});
			return;
		}

		if (
			normalizedSelection.anchor.blockId !==
			normalizedSelection.focus.blockId
		) {
			this.fieldEditor.applyDocumentTextSelection(
				normalizedSelection.anchor,
				normalizedSelection.focus,
			);
			return;
		}

		if (
			normalizedSelection.anchor.blockId !== this.fieldEditor.focusBlockId
		) {
			this.fieldEditor.activateTextSelection(
				normalizedSelection.anchor.blockId,
				normalizedSelection.anchor.offset,
				normalizedSelection.focus.offset,
			);
			return;
		}

		const selection = this.element.ownerDocument?.getSelection();
		if (!selection?.rangeCount) return;
		if (!this.element.contains(selection.anchorNode)) return;
		if (!this.element.contains(selection.focusNode)) return;

		const offsets = getDirectionalSelectionOffsets(this.element);
		if (!offsets) return;
		const editorSelectionRange = this.resolveEditorSelectionRange(
			normalizedSelection.anchor.blockId,
		);
		if (
			editorSelectionRange &&
			offsets.anchor === offsets.focus &&
			(offsets.start !== editorSelectionRange.start ||
				offsets.end !== editorSelectionRange.end)
		) {
			this.setEditContextSelection({
				blockId: normalizedSelection.anchor.blockId,
				anchorOffset: editorSelectionRange.start,
				focusOffset: editorSelectionRange.end,
			});
			this.restoreDOMCaret();
			return;
		}
		const authoritativeSelection = this.getAuthoritativeTextInputSelection(
			normalizedSelection.anchor.blockId,
		);
		if (
			authoritativeSelection &&
			offsets.anchor === offsets.focus &&
			(offsets.anchor !== authoritativeSelection.anchorOffset ||
				offsets.focus !== authoritativeSelection.focusOffset)
		) {
			this.setEditContextSelection(authoritativeSelection, {
				source: "text-update",
			});
			this.restoreDOMCaret();
			return;
		}

		this.editContext.updateSelection(offsets.start, offsets.end);
		const nextSelection = {
			blockId: normalizedSelection.anchor.blockId,
			anchorOffset: offsets.anchor,
			focusOffset: offsets.focus,
		};
		this.fieldEditor.setEditContextSelectionSnapshot(nextSelection);
		this.fieldEditor.setBackendSelectionAuthority("user-dom", nextSelection);
		this.fieldEditor.syncTextSelection(
			normalizedSelection.anchor.blockId,
			offsets.anchor,
			offsets.focus,
		);
	};

	protected handleYTextChange = (event: FieldEditorTextChangeEvent): void => {
		if (!this.editContext || !this.element || !this.ytext) return;
		const isHistory = isHistoryTransactionOrigin(event.transaction?.origin);
		if (isHistory) {
			this.fieldEditor.clearBackendSelectionAuthority(
				"edit-context-textupdate",
			);
			const nextText = toEditContextText(this.ytext?.toString?.() ?? "");
			this.editContext.updateText(
				0,
				this.editContext.text.length,
				nextText,
			);
			const clampedSelectionStart = Math.min(
				this.editContext.selectionStart,
				nextText.length,
			);
			const clampedSelectionEnd = Math.min(
				this.editContext.selectionEnd,
				nextText.length,
			);
			this.editContext.updateSelection(
				clampedSelectionStart,
				clampedSelectionEnd,
			);
			const blockId = this.fieldEditor.focusBlockId;
			this.fieldEditor.setEditContextSelectionSnapshot(
				blockId
					? {
							blockId,
							anchorOffset: clampedSelectionStart,
							focusOffset: clampedSelectionEnd,
						}
					: null,
			);
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				preserveSelection: true,
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.fieldEditor.notifyDomReconciled(blockId ?? undefined);
			this.restoreDOMCaret();
			return;
		}

		const applied = applyDeltaToDOM(
			event.delta,
			this.element,
			this.editor.schema,
		);
		if (!applied) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				preserveSelection: true,
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.fieldEditor.notifyDomReconciled(
				this.fieldEditor.focusBlockId ?? undefined,
			);
		}

		if (
			shouldReplaceEditContextText(
				event.delta,
				this.editContext.text.length,
			)
		) {
			const nextText = toEditContextText(this.ytext.toString());
			this.editContext.updateText(
				0,
				this.editContext.text.length,
				nextText,
			);
		} else {
			const delta = event.delta;
			let offset = 0;
			for (const entry of delta) {
				if (entry.retain != null) {
					offset += entry.retain;
				} else if (typeof entry.insert === "string") {
					this.editContext.updateText(offset, offset, entry.insert);
					offset += entry.insert.length;
				} else if (entry.delete != null) {
					this.editContext.updateText(
						offset,
						offset + entry.delete,
						"",
					);
				}
			}
		}

		const pendingSelection = this.fieldEditor.focusBlockId
			? this.fieldEditor.getBackendSelectionAuthority(
					"programmatic",
					this.fieldEditor.focusBlockId,
				)
			: null;
		if (pendingSelection) {
			this.setEditContextSelection(pendingSelection, {
				source: "text-update",
			});
		}
		this.restoreDOMCaret();
	};

	protected restoreDOMCaret(): void {
		if (!this.editContext || !this.element) return;

		const root = this.element.closest(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		const selection = this.fieldEditor.selection;
		const blockId = this.fieldEditor.focusBlockId;
		const pendingSelection =
			blockId != null
				? this.fieldEditor.getBackendSelectionAuthority(
						"programmatic",
						blockId,
					)
				: null;
		const authoritativeInputSelection =
			blockId != null
				? this.fieldEditor.getBackendSelectionAuthority(
						"edit-context-textupdate",
						blockId,
					)
				: null;
		const editContextSelection =
			this.fieldEditor.getEditContextSelectionSnapshot(blockId);
		const editorSelection =
			selection?.type === "text" &&
			blockId &&
			selection.anchor.blockId === blockId &&
			selection.focus.blockId === blockId
				? selection
				: null;
		const anchorOffset =
			pendingSelection?.anchorOffset ??
			authoritativeInputSelection?.anchorOffset ??
			editorSelection?.anchor.offset ??
			editContextSelection?.anchorOffset ??
			null;
		const focusOffset =
			pendingSelection?.focusOffset ??
			authoritativeInputSelection?.focusOffset ??
			editorSelection?.focus.offset ??
			editContextSelection?.focusOffset ??
			null;
		if (root && blockId && anchorOffset != null && focusOffset != null) {
			this.fieldEditor.applyBackendSelectionUntilNextFrame();
			editorSelectionToDOM(
				root,
				{ blockId, offset: anchorOffset },
				{ blockId, offset: focusOffset },
			);
			return;
		}

		const start = this.editContext.selectionStart;
		const end = this.editContext.selectionEnd;

		const anchorPoint = findTextPosition(this.element, start);
		const focusPoint =
			start === end ? anchorPoint : findTextPosition(this.element, end);
		if (!anchorPoint || !focusPoint) return;

		const sel = this.element.ownerDocument?.getSelection();
		if (!sel) return;

		this.fieldEditor.applyBackendSelectionUntilNextFrame();
		sel.removeAllRanges();
		const range = document.createRange();
		range.setStart(anchorPoint.node, anchorPoint.offset);
		range.setEnd(focusPoint.node, focusPoint.offset);
		sel.addRange(range);
	}

	protected getInlineDecorationsForBlock(): readonly InlineDecoration[] {
		const blockId = this.fieldEditor.focusBlockId;
		if (!blockId) {
			return [];
		}
		return this.editor
			.getDecorations()
			.forBlock(blockId)
			.filter(
				(decoration): decoration is InlineDecoration =>
					decoration.type === "inline",
			);
	}

}
