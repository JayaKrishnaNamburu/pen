import { isCollapsed } from "@input/pen-core";
import type { Editor, InlineDecoration } from "@input/pen-types";
import type { FieldEditorInputController } from "./controller";
import { fullReconcileToDOM, applyDeltaToDOM } from "./reconciler";
import {
	domSelectionToEditor,
	editorSelectionToDOM,
	getDirectionalSelectionOffsets,
} from "./selectionBridge";
import {
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
import { urlPolicyFromEditor } from "../security/resolveEditorUrl";
import type {
	FieldEditorDelta,
	FieldEditorObserver,
	FieldEditorTextChangeEvent,
	FieldEditorTextLike,
} from "./crdt";
import {
	EditContextBackendCore,
	type EditContextSelectionOptions,
} from "./editContextBackendCore";

type PendingEditContextTextUpdate = {
	blockId: string;
	text: string;
	originRange: { start: number; end: number };
	selection: EditContextSelection | null;
	selectionStart?: number;
	selectionEnd?: number;
};

export abstract class EditContextBackendInput extends EditContextBackendCore {
	protected isComposing = false;
	protected deferredRemoteDeltas: Array<{ delta: FieldEditorDelta[] }> = [];
	protected pendingTextUpdate: PendingEditContextTextUpdate | null = null;
	protected lastCommittedTextUpdate: PendingEditContextTextUpdate | null =
		null;
	protected ignoreNextTextFormatUpdate = false;
	protected paintedCompositionPreview = false;

	activate(element: HTMLElement, ytext: unknown): void {
		this.isComposing = false;
		this.deferredRemoteDeltas = [];
		this.clearPendingTextUpdate();
		super.activate(element, ytext);
		element.addEventListener("keydown", this.handleCompositionCancelKey);
	}

	deactivate(): void {
		this.element?.removeEventListener(
			"keydown",
			this.handleCompositionCancelKey,
		);
		this.isComposing = false;
		this.deferredRemoteDeltas = [];
		this.clearPendingTextUpdate();
		super.deactivate();
	}

	protected handleCompositionStart = (): void => {
		this.beginEditContextComposition();
	};

	protected handleCompositionEnd = (event?: Event): void => {
		const committed =
			event instanceof CompositionEvent ? (event.data ?? "") : "";
		if (this.pendingTextUpdate) {
			if (committed.length === 0) {
				this.dropPendingTextUpdate();
				this.ignoreNextTextFormatUpdate = true;
			} else {
				this.commitPendingTextUpdate();
			}
		}
		this.closeEditContextComposition();
	};

	protected handleCompositionCancelKey = (event: KeyboardEvent): void => {
		if (event.key !== "Escape") {
			return;
		}
		if (
			!this.pendingTextUpdate ||
			!this.hasInFlightEditContextComposition()
		) {
			return;
		}
		this.dropPendingTextUpdate();
		this.closeEditContextComposition();
	};

	protected hasInFlightEditContextComposition(): boolean {
		return this.isComposing || this.fieldEditor.isComposing;
	}

	protected beginEditContextComposition(): void {
		if (this.isComposing) {
			return;
		}
		this.isComposing = true;
		this.deferredRemoteDeltas = [];
		this.fieldEditor.notifyGestureEvent?.("compositionstart");
		this.fieldEditor.setComposing(true);
	}

	protected closeEditContextComposition(): void {
		this.isComposing = false;
		this.fieldEditor.setComposing(false);
		this.flushDeferredRemoteDeltas();
		this.fieldEditor.notifyGestureEvent?.("compositionend-completed");
	}

	protected clearPendingTextUpdate(): void {
		this.pendingTextUpdate = null;
		this.lastCommittedTextUpdate = null;
		this.ignoreNextTextFormatUpdate = false;
		this.paintedCompositionPreview = false;
	}

	protected capturePendingTextUpdate(input: {
		blockId: string;
		updateRangeStart: number;
		updateRangeEnd: number;
		text: string;
		selectionStart?: number;
		selectionEnd?: number;
	}): PendingEditContextTextUpdate {
		const resolved = this.resolveTextUpdateRange(input);
		return {
			blockId: input.blockId,
			text: input.text,
			originRange: resolved.range,
			selection: resolved.selection,
			selectionStart: input.selectionStart,
			selectionEnd: input.selectionEnd,
		};
	}

	protected rewindLastCommittedIntoPending(): void {
		const last = this.lastCommittedTextUpdate;
		if (!last || last.text.length === 0) {
			this.lastCommittedTextUpdate = null;
			return;
		}
		this.editor.apply(
			[
				{
					type: "splice-text",
					blockId: last.blockId,
					from: last.originRange.start,
					to: last.originRange.start + last.text.length,
					insert: "",
				},
			],
			{ origin: "system" },
		);
		this.pendingTextUpdate = last;
		this.lastCommittedTextUpdate = null;
		this.paintedCompositionPreview = true;
	}

	protected dropPendingTextUpdate(): void {
		if (this.paintedCompositionPreview && this.element && this.ytext) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				urlPolicy: urlPolicyFromEditor(this.editor),
				preserveSelection: true,
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.fieldEditor.notifyDomReconciled(
				this.fieldEditor.focusBlockId ?? undefined,
			);
			this.restoreDOMCaret();
		}
		this.pendingTextUpdate = null;
		this.lastCommittedTextUpdate = null;
		this.paintedCompositionPreview = false;
	}

	protected commitPendingTextUpdate(): void {
		const pending = this.pendingTextUpdate;
		if (!pending) {
			return;
		}
		this.pendingTextUpdate = null;
		this.lastCommittedTextUpdate = null;
		this.paintedCompositionPreview = false;
		this.ignoreNextTextFormatUpdate = true;
		this.applyEditContextTextUpdate(pending);
	}

	protected flushDeferredRemoteDeltas(): void {
		if (this.deferredRemoteDeltas.length === 0) {
			return;
		}
		this.deferredRemoteDeltas = [];
		if (!this.editContext || !this.element || !this.ytext) {
			return;
		}
		const nextText = toEditContextText(this.ytext.toString());
		this.editContext.updateText(0, this.editContext.text.length, nextText);
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
		fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
			urlPolicy: urlPolicyFromEditor(this.editor),
			preserveSelection: true,
			inlineDecorations: this.getInlineDecorationsForBlock(),
		});
		this.fieldEditor.notifyDomReconciled(
			this.fieldEditor.focusBlockId ?? undefined,
		);
		this.restoreDOMCaret();
	}

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

		if (
			this.pendingTextUpdate &&
			this.hasInFlightEditContextComposition()
		) {
			if (text.length === 0) {
				this.dropPendingTextUpdate();
				this.ignoreNextTextFormatUpdate = true;
				this.closeEditContextComposition();
				return;
			}
			this.pendingTextUpdate = {
				...this.pendingTextUpdate,
				text,
				selection:
					selectionStart != null && selectionEnd != null
						? {
								blockId,
								anchorOffset: selectionStart,
								focusOffset: selectionEnd,
							}
						: this.pendingTextUpdate.selection,
				selectionStart,
				selectionEnd,
			};
			this.commitPendingTextUpdate();
			this.closeEditContextComposition();
			return;
		}

		const pending = this.capturePendingTextUpdate({
			blockId,
			updateRangeStart,
			updateRangeEnd,
			text,
			selectionStart,
			selectionEnd,
		});
		this.applyEditContextTextUpdate(pending);
		this.lastCommittedTextUpdate = pending;
	};

	protected applyEditContextTextUpdate(
		pending: PendingEditContextTextUpdate,
	): void {
		if (!this.ytext) {
			return;
		}
		const { blockId, text, originRange } = pending;
		const range = originRange;
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
			marks: this.fieldEditor.resolveInsertMarks(this.ytext, range.start),
			selection: pending.selection,
			syncSelection: pending.selection != null,
		});

		if (pending.selection) {
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
	}

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
			isCollapsed(selection) &&
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
			editContextSelection:
				this.fieldEditor.getEditContextSelectionSnapshot(input.blockId),
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
			isCollapsed(selection) ||
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
		if (this.ignoreNextTextFormatUpdate) {
			this.ignoreNextTextFormatUpdate = false;
			applyEditContextTextFormats(this.element, ranges);
			return;
		}
		this.beginEditContextComposition();
		this.rewindLastCommittedIntoPending();
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
