import { isCollapsed } from "@input/pen-core";
import type { InlineDecoration } from "@input/pen-types";
import { buildInlineDecorationsRenderSignature } from "../utils/inlineDecorations";
import { urlPolicyFromEditor } from "../security/resolveEditorUrl";
import { fullReconcileToDOM } from "./reconciler";
import {
	domSelectionToEditor,
	extractTextFromDOM,
	getSelectionOffsets,
} from "./selectionBridge";
import { normalizeSelectionFormation } from "../utils/selectionFormation";
import { handleCopy, handleCut } from "./clipboard";
import { handleFieldEditorKeyDown } from "./keyHandling";
import type { InlineTextDiffOp } from "./inlineTextTransaction";
import { applyInlineTextDiffInput } from "./textInputPipeline";
import { ContentEditableBackendEvents } from "./contenteditableBackendEvents";
import { shouldStopEquivalentDomRead } from "./selectionReader";
import {
	isNavigationSelectionKey,
	setSelectionOffsets,
} from "./contenteditableDomHelpers";

export class ContentEditableBackendSelection extends ContentEditableBackendEvents {
	protected applyTextDiffAsOps(
		blockId: string,
		diff: InlineTextDiffOp[],
	): void {
		if (diff.length === 0) return;
		const ytext = this.ytext;
		if (!ytext) return;

		const cellCoord = this._getActiveCellCoord(blockId);
		const range = this.element ? getSelectionOffsets(this.element) : null;
		const selection = range
			? {
					blockId,
					anchorOffset: range.start,
					focusOffset: range.end,
					cell: cellCoord
						? { row: cellCoord.row, col: cellCoord.col }
						: undefined,
				}
			: null;
		const result = applyInlineTextDiffInput({
			editor: this.editor,
			fieldEditor: this.fieldEditor,
			blockId,
			diff,
			ytext,
			selection,
			cellCoord,
		});
		if (!result.applied) return;
		this.ensureActiveDOMMatchesYText();
		this.restoreDOMSelectionFromEditor();
		this.scheduleActiveDOMMatchCheck();
		this.fieldEditor.clearBackendSelectionAuthority("programmatic");
	}

	protected ensureActiveDOMMatchesYText(): boolean {
		if (!this.element || !this.ytext) return false;
		const nextInlineDecorationsSignature = this.getInlineDecorationsSignature();
		if (
			extractTextFromDOM(this.element) === this.ytext.toString() &&
			nextInlineDecorationsSignature === this.inlineDecorationsSignature
		) {
			return false;
		}

		fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
			urlPolicy: urlPolicyFromEditor(this.editor),
			preserveSelection: true,
			inlineDecorations: this.getInlineDecorationsForBlock(),
		});
		this.discardObservedMutations();
		this.fieldEditor.notifyDomReconciled(
			this.fieldEditor.focusBlockId ?? undefined,
		);
		this.inlineDecorationsSignature = nextInlineDecorationsSignature;
		return true;
	}

	protected handleDecorationsChange = (): void => {
		if (this.isComposing) {
			return;
		}
		if (this.getInlineDecorationsSignature() === this.inlineDecorationsSignature) {
			return;
		}
		this.scheduleActiveDOMMatchCheck();
	};

	protected scheduleActiveDOMMatchCheck(): void {
		if (this.pendingDomSyncFrame != null) {
			cancelAnimationFrame(this.pendingDomSyncFrame);
		}

		this.pendingDomSyncFrame = requestAnimationFrame(() => {
			this.pendingDomSyncFrame = null;
			if (this.ensureActiveDOMMatchesYText()) {
				this.restoreDOMSelectionFromEditor();
			}
		});
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

	protected getInlineDecorationsSignature(): readonly InlineDecoration[] {
		return buildInlineDecorationsRenderSignature(
			this.getInlineDecorationsForBlock(),
			this.inlineDecorationsSignature,
		);
	}

	// ── Keyboard shortcuts ────────────────────────────────────

	protected handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.ytext) return;
		if (isNavigationSelectionKey(event)) {
			this.fieldEditor.clearBackendSelectionAuthority("programmatic");
			this.fieldEditor.clearBackendSelectionAuthority("user-dom");
		}

		const handled = handleFieldEditorKeyDown({
			event,
			editor: this.editor,
			fieldEditor: this.fieldEditor,
			ytext: this.ytext,
			range: this.element ? getSelectionOffsets(this.element) : null,
		});
		if (handled) {
			event.preventDefault();
			return;
		}
	};

	resolveLiveInputRange(): {
		start: number;
		end: number;
	} | null {
		return this.element ? getSelectionOffsets(this.element) : null;
	}

	resolveCurrentInputRange(): {
		start: number;
		end: number;
	} | null {
		return this.resolveLiveInputRange();
	}

	protected handleSelectionChange = (): void => {
		if (!this.element) return;
		const isApplyingSelection =
			this.fieldEditor.getBackendSelectionApplicationDepth();
		if (
			!this.fieldEditor.shouldHandleDomSelectionChange(
				isApplyingSelection,
			)
		) {
			if (this.shouldRestoreSuppressedFullBlockSelection()) {
				this.restoreDOMSelectionFromEditor();
			} else if (
				isApplyingSelection > 0 &&
				this.shouldRestoreSuppressedProjectedSelection()
			) {
				this.restoreDOMSelectionFromEditor();
			}
			return;
		}

		const root = this.element.closest(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		if (!root) return;

		const selection = domSelectionToEditor(root);
		if (!selection) return;
		const normalizedSelection = normalizeSelectionFormation(
			this.editor,
			selection,
		);

		if (shouldStopEquivalentDomRead(this.editor, normalizedSelection)) {
			return;
		}

		if (this.shouldRestoreStaleFullBlockSelection(normalizedSelection)) {
			this.restoreDOMSelectionFromEditor();
			return;
		}

		if (this.shouldRestoreStaleProjectedSelection(normalizedSelection)) {
			this.restoreDOMSelectionFromEditor();
			return;
		}

		if (normalizedSelection.type === "block") {
			if (this.fieldEditor.readDomSelection) {
				this.fieldEditor.readDomSelection({
					type: "block",
					blockIds: normalizedSelection.blockIds,
				});
				return;
			}
			this.fieldEditor.deactivate();
			this.editor.setSelection({
				type: "block",
				blockIds: normalizedSelection.blockIds,
			});
			return;
		}

		if (this.fieldEditor.readDomSelection) {
			this.fieldEditor.readDomSelection({
				type: "text",
				anchor: normalizedSelection.anchor,
				focus: normalizedSelection.focus,
			});
			return;
		}

		this.fieldEditor.setBackendSelectionAuthority("user-dom", {
			blockId: normalizedSelection.anchor.blockId,
			anchorOffset: normalizedSelection.anchor.offset,
			focusOffset: normalizedSelection.focus.offset,
		});
		const projectedSelection = this.fieldEditor.getBackendSelectionAuthority(
			"programmatic",
			normalizedSelection.anchor.blockId,
		);
		if (
			!projectedSelection ||
			projectedSelection.anchorOffset !== normalizedSelection.anchor.offset ||
			projectedSelection.focusOffset !== normalizedSelection.focus.offset
		) {
			this.fieldEditor.clearBackendSelectionAuthority("programmatic");
		}
		this.fieldEditor.applyDomTextSelection(
			normalizedSelection.anchor,
			normalizedSelection.focus,
		);
	};

	protected shouldRestoreStaleFullBlockSelection(
		selection: ReturnType<typeof normalizeSelectionFormation>,
	): boolean {
		if (selection.type === "block") {
			return false;
		}
		if (selection.anchor.blockId !== selection.focus.blockId) {
			return false;
		}

		const currentSelection = this.fieldEditor.selection;
		if (
			currentSelection?.type !== "text" ||
			!isCollapsed(currentSelection) ||
			currentSelection.focus.blockId !== selection.anchor.blockId
		) {
			return false;
		}

		const block = this.editor.getBlock(selection.anchor.blockId);
		const blockLength = block?.length() ?? null;
		if (blockLength == null) {
			return false;
		}

		const selectionStart = Math.min(
			selection.anchor.offset,
			selection.focus.offset,
		);
		const selectionEnd = Math.max(
			selection.anchor.offset,
			selection.focus.offset,
		);
		return selectionStart === 0 && selectionEnd === blockLength;
	}

	protected shouldRestoreStaleProjectedSelection(
		selection: ReturnType<typeof normalizeSelectionFormation>,
	): boolean {
		if (
			selection.type === "block" ||
			selection.anchor.blockId !== selection.focus.blockId ||
			selection.anchor.offset !== selection.focus.offset
		) {
			return false;
		}
		const projectedSelection = this.fieldEditor.getBackendSelectionAuthority(
			"programmatic",
			selection.anchor.blockId,
		) ?? this.fieldEditor.getBackendSelectionAuthority(
			"user-dom",
			selection.anchor.blockId,
		);
		if (!projectedSelection) {
			return false;
		}
		return (
			selection.anchor.offset !== projectedSelection.anchorOffset ||
			selection.focus.offset !== projectedSelection.focusOffset
		);
	}

	protected shouldRestoreSuppressedProjectedSelection(): boolean {
		if (!this.element) {
			return false;
		}
		const root = this.element.closest(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		if (!root) {
			return false;
		}

		const selection = domSelectionToEditor(root);
		if (!selection) {
			return false;
		}

		return this.shouldRestoreStaleProjectedSelection(
			normalizeSelectionFormation(this.editor, selection),
		);
	}

	protected shouldRestoreSuppressedFullBlockSelection(): boolean {
		if (!this.element) {
			return false;
		}
		const root = this.element.closest(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		if (!root) {
			return false;
		}

		const selection = domSelectionToEditor(root);
		if (!selection) {
			return false;
		}

		return this.shouldRestoreStaleFullBlockSelection(
			normalizeSelectionFormation(this.editor, selection),
		);
	}

	// ── Clipboard events ──────────────────────────────────────

	protected handleCopyEvent = (event: ClipboardEvent): void => {
		event.preventDefault();
		handleCopy(this.editor, event);
	};

	protected handleCutEvent = (event: ClipboardEvent): void => {
		event.preventDefault();
		handleCut(this.editor, event);
	};

	protected handleDragStart = (event: DragEvent): void => {
		this.fieldEditor.notifyGestureEvent?.("dragstart");
		event.preventDefault();
	};

	protected handleDrop = (event: DragEvent): void => {
		this.fieldEditor.notifyGestureEvent?.("drop-completed");
		event.preventDefault();
	};

	protected handlePointerDown = (): void => {
		this.fieldEditor.notifyGestureEvent?.("pointerdown");
		this.fieldEditor.clearBackendSelectionAuthority("programmatic");
	};
}
