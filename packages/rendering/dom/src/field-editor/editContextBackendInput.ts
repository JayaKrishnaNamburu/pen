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
import {
	EditContextBackendCore,
	type EditContextSelectionOptions,
} from "./editContextBackendCore";

export abstract class EditContextBackendInput extends EditContextBackendCore {
	protected handleTextUpdate = (event: Event): void => {
		if (!this.ytext) return;
		const {
			updateRangeStart,
			updateRangeEnd,
			text,
			selectionStart,
			selectionEnd,
		} = event as EditContextTextUpdateEvent;
		const blockId = this.fieldEditor.focusBlockId;
		if (!blockId) return;

		const block = this.editor.getBlock(blockId);
		if (!block) {
			this.fieldEditor.deactivate();
			return;
		}

		const resolvedTextUpdate = this.resolveTextUpdateRange({
			blockId,
			updateRangeStart,
			updateRangeEnd,
			text,
			selectionStart,
			selectionEnd,
		});
		const { range } = resolvedTextUpdate;
		const listInputRuleTarget = applyListInputRule(this.editor, {
			blockId,
			range,
			text,
		});
		if (listInputRuleTarget) {
			const nextSelection = {
				blockId: listInputRuleTarget.blockId,
				anchorOffset: listInputRuleTarget.anchorOffset,
				focusOffset: listInputRuleTarget.focusOffset,
			};
			this.fieldEditor.setBackendSelectionAuthority(
				"programmatic",
				nextSelection,
			);
			this.setEditContextSelection(nextSelection, {
				source: "text-update",
			});
			this.fieldEditor.syncTextSelection(
				listInputRuleTarget.blockId,
				listInputRuleTarget.anchorOffset,
				listInputRuleTarget.focusOffset,
			);
			this.restoreDOMCaret();
			this.fieldEditor.clearBackendSelectionAuthority("programmatic");
			return;
		}

		const inlineInputRuleTarget = applyInlineInputRule(this.editor, {
			blockId,
			offset: range.start,
			text,
		});
		if (inlineInputRuleTarget) {
			this.fieldEditor.setBackendSelectionAuthority(
				"programmatic",
				inlineInputRuleTarget,
			);
			this.setEditContextSelection(inlineInputRuleTarget, {
				source: "text-update",
			});
			this.fieldEditor.syncTextSelection(
				inlineInputRuleTarget.blockId,
				inlineInputRuleTarget.anchorOffset,
				inlineInputRuleTarget.focusOffset,
			);
			this.restoreDOMCaret();
			this.fieldEditor.clearBackendSelectionAuthority("programmatic");
			return;
		}

		const selection = applyInlineTextInput({
			editor: this.editor,
			fieldEditor: this.fieldEditor,
			blockId,
			range,
			text,
			marks: this.fieldEditor.resolveInsertMarks(
				this.ytext,
				range.start,
			),
			selection: resolvedTextUpdate.selection,
			syncSelection: resolvedTextUpdate.selection != null,
		});

		if (resolvedTextUpdate.selection) {
			this.setEditContextSelection(selection, {
				source: "text-update",
			});
			this.fieldEditor.syncTextSelection(
				blockId,
				selection.anchorOffset,
				selection.focusOffset,
			);
			this.restoreDOMCaret();
		}

		this.fieldEditor.clearBackendSelectionAuthority("programmatic");
	};

	protected resolveTextUpdateRange(input: {
		blockId: string;
		updateRangeStart: number;
		updateRangeEnd: number;
		text: string;
		selectionStart?: number;
		selectionEnd?: number;
	}): {
		range: { start: number; end: number };
		selection: EditContextSelection | null;
	} {
		const selection = this.fieldEditor.selection;
		const editorCaret =
			selection?.type === "text" &&
			selection.isCollapsed &&
			selection.focus.blockId === input.blockId
				? selection.focus.offset
				: null;

		return resolveEditContextTextUpdateRange({
			...input,
			isLogicallyEmpty: isLogicallyEmptyText(
				this.ytext?.toString() ?? "",
			),
			editorSelectionRange: this.resolveEditorSelectionRange(
				input.blockId,
			),
			programmaticInputRange:
				this.fieldEditor.resolveProgrammaticInputRange(input.blockId, {
					start: input.updateRangeStart,
					end: input.updateRangeEnd,
				}),
			editContextSelection:
				this.fieldEditor.getEditContextSelectionSnapshot(
					input.blockId,
				),
			authoritativeTextInputSelection:
				this.fieldEditor.getBackendSelectionAuthority(
					"edit-context-textupdate",
					input.blockId,
				),
			editorCaret,
		});
	}

	protected setEditContextSelection(
		selection: EditContextSelection,
		options?: EditContextSelectionOptions,
	): void {
		const resolvedSelection = {
			blockId: selection.blockId,
			anchorOffset: this.resolveEditContextOffset(
				selection.anchorOffset,
				options,
			),
			focusOffset: this.resolveEditContextOffset(
				selection.focusOffset,
				options,
			),
		};
		this.fieldEditor.setEditContextSelectionSnapshot(resolvedSelection);
		if (options?.source === "text-update") {
			this.fieldEditor.setBackendSelectionAuthority(
				"edit-context-textupdate",
				resolvedSelection,
			);
		}
		this.editContext?.updateSelection(
			resolvedSelection.anchorOffset,
			resolvedSelection.focusOffset,
		);
	}

	protected resolveEditContextOffset(
		offset: number,
		options?: EditContextSelectionOptions,
	): number {
		return options?.source !== "text-update" &&
			isLogicallyEmptyText(this.ytext?.toString() ?? "")
			? 0
			: offset;
	}

	protected resolveEditorSelectionRange(
		blockId: string,
	): EditContextRange | null {
		const selection = this.fieldEditor.selection;
		if (
			selection?.type !== "text" ||
			selection.isCollapsed ||
			selection.anchor.blockId !== blockId ||
			selection.focus.blockId !== blockId
		) {
			return null;
		}

		return {
			start: Math.min(selection.anchor.offset, selection.focus.offset),
			end: Math.max(selection.anchor.offset, selection.focus.offset),
		};
	}

	protected shouldIgnoreStaleCollapsedDomSelection(
		selection: ReturnType<typeof normalizeSelectionFormation>,
	): boolean {
		if (selection.type === "block") {
			return false;
		}
		if (
			selection.anchor.blockId !== selection.focus.blockId ||
			selection.anchor.offset !== selection.focus.offset
		) {
			return false;
		}

		const editorSelectionRange =
			this.resolveEditorSelectionRange(selection.anchor.blockId) ??
			this.resolveCollapsedEditorSelectionRange(selection.anchor.blockId);
		if (!editorSelectionRange) {
			return false;
		}

		return (
			selection.anchor.offset !== editorSelectionRange.start ||
			selection.focus.offset !== editorSelectionRange.end
		);
	}

	protected handleTextFormatUpdate = (event: Event): void => {
		if (!this.element) return;

		const ranges =
			(event as EditContextTextFormatUpdateEvent).getTextFormats?.() ??
			[];
		applyEditContextTextFormats(this.element, ranges);
	};

	protected handleCharacterBoundsUpdate = (event: Event): void => {
		if (!this.element || !this.editContext) return;

		const { rangeStart, rangeEnd } =
			event as EditContextCharacterBoundsUpdateEvent;
		this.editContext.updateCharacterBounds(
			rangeStart,
			buildEditContextCharacterBounds(this.element, rangeStart, rangeEnd),
		);
	};

}
