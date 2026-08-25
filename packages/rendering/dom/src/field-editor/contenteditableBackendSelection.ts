import type { InlineDecoration } from "@input/pen-types";
import { buildInlineDecorationsRenderSignature } from "../utils/inlineDecorations";
import { urlPolicyFromEditor } from "../security/resolveEditorUrl";
import { fullReconcileToDOM } from "./reconciler";
import { extractTextFromDOM, getSelectionOffsets } from "./selectionBridge";
import { handleCopy, handleCut } from "./clipboard";
import { handleFieldEditorKeyDown } from "./keyHandling";
import type { InlineTextDiffOp } from "./inlineTextTransaction";
import { applyInlineTextDiffInput } from "./textInputPipeline";
import { ContentEditableBackendEvents } from "./contenteditableBackendEvents";
import {
	forwardDomSelectionToReader,
	readNormalizedDomProposal,
	resolveEditorRoot,
	shouldStopEquivalentDomRead,
} from "./selectionReader";
import {
	isCollapsedDomAgainstProjectedOffsets,
	isFullBlockEchoAgainstCollapsedCaret,
} from "./selectionProjectionController";
import { isNavigationSelectionKey } from "./contenteditableDomHelpers";

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
		this.fieldEditor.clearBackendSelectionAuthority("programmatic");
	}

	protected ensureActiveDOMMatchesYText(): boolean {
		if (!this.element || !this.ytext) return false;
		const nextInlineDecorationsSignature =
			this.getInlineDecorationsSignature();
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
		if (
			this.getInlineDecorationsSignature() ===
			this.inlineDecorationsSignature
		) {
			return;
		}
		if (this.ensureActiveDOMMatchesYText()) {
			this.restoreDOMSelectionFromEditor();
		}
	};

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
			const suppressed = this.readAttachedNormalizedSelection();
			if (
				suppressed &&
				isFullBlockEchoAgainstCollapsedCaret(
					suppressed,
					this.fieldEditor.selection,
					(blockId) =>
						this.editor.getBlock(blockId)?.length() ?? null,
				)
			) {
				this.restoreDOMSelectionFromEditor();
			} else if (
				isApplyingSelection > 0 &&
				suppressed &&
				isCollapsedDomAgainstProjectedOffsets(
					suppressed,
					(blockId) =>
						this.fieldEditor.getBackendSelectionAuthority(
							"programmatic",
							blockId,
						) ??
						this.fieldEditor.getBackendSelectionAuthority(
							"user-dom",
							blockId,
						),
				)
			) {
				this.restoreDOMSelectionFromEditor();
			}
			return;
		}

		const root = resolveEditorRoot(this.element);
		if (!root) return;

		const normalizedSelection = readNormalizedDomProposal(
			root,
			this.editor,
		);
		if (!normalizedSelection) return;

		if (shouldStopEquivalentDomRead(this.editor, normalizedSelection)) {
			return;
		}

		if (
			isFullBlockEchoAgainstCollapsedCaret(
				normalizedSelection,
				this.fieldEditor.selection,
				(blockId) => this.editor.getBlock(blockId)?.length() ?? null,
			)
		) {
			this.restoreDOMSelectionFromEditor();
			return;
		}

		if (
			isCollapsedDomAgainstProjectedOffsets(
				normalizedSelection,
				(blockId) =>
					this.fieldEditor.getBackendSelectionAuthority(
						"programmatic",
						blockId,
					) ??
					this.fieldEditor.getBackendSelectionAuthority(
						"user-dom",
						blockId,
					),
			)
		) {
			this.restoreDOMSelectionFromEditor();
			return;
		}

		if (
			forwardDomSelectionToReader(this.fieldEditor, normalizedSelection)
		) {
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

		this.fieldEditor.setBackendSelectionAuthority("user-dom", {
			blockId: normalizedSelection.anchor.blockId,
			anchorOffset: normalizedSelection.anchor.offset,
			focusOffset: normalizedSelection.focus.offset,
		});
		const projectedSelection =
			this.fieldEditor.getBackendSelectionAuthority(
				"programmatic",
				normalizedSelection.anchor.blockId,
			);
		if (
			!projectedSelection ||
			projectedSelection.anchorOffset !==
				normalizedSelection.anchor.offset ||
			projectedSelection.focusOffset !== normalizedSelection.focus.offset
		) {
			this.fieldEditor.clearBackendSelectionAuthority("programmatic");
		}
		this.fieldEditor.applyDomTextSelection(
			normalizedSelection.anchor,
			normalizedSelection.focus,
		);
	};

	private readAttachedNormalizedSelection(): ReturnType<
		typeof readNormalizedDomProposal
	> {
		if (!this.element) {
			return null;
		}
		const root = resolveEditorRoot(this.element);
		if (!root) {
			return null;
		}
		return readNormalizedDomProposal(root, this.editor);
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
