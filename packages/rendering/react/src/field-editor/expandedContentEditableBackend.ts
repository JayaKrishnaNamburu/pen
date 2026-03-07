import type { Editor } from "@pen/core";
import {
	editorSelectionToDOM,
	domSelectionToEditor,
} from "./selectionBridge.js";
import { handlePaste, handleCopy, handleCut } from "./clipboard.js";
import type { PasteImporters } from "../context/editorContext.js";
import type { FieldEditorImpl } from "./fieldEditorImpl.js";
import { getExpandedBlockRole } from "./crossBlock.js";
import { applyDeltaToDOM, fullReconcileToDOM } from "./reconciler.js";
import { applyEnterBehavior, toggleInlineMark } from "./commands.js";
import {
	handleEditorKeyBindings,
	handleSelectAllShortcut,
} from "./keyHandling.js";

/**
 * Expanded mode owns the shared cross-block selected state on the real block
 * list DOM. It intentionally handles only range selection plus replace/delete
 * style inputs; once the DOM selection collapses back to a single block we hand
 * control back to the normal single-block backend path.
 */
export class ExpandedContentEditableBackend {
	private element: HTMLElement | null = null;
	private editor: Editor;
	private fieldEditor: FieldEditorImpl;
	private isApplyingSelection = false;
	private observedBlocks = new Map<
		string,
		{ ytext: any; handler: (event: { delta?: unknown[] }) => void }
	>();

	constructor(editor: Editor, fieldEditor: FieldEditorImpl) {
		this.editor = editor;
		this.fieldEditor = fieldEditor;
	}

	activate(element: HTMLElement): void {
		this.element = element;
		element.contentEditable = "true";
		element.tabIndex = -1;
		this.syncObservedBlocks();

		element.addEventListener("beforeinput", this.handleBeforeInput);
		element.addEventListener("keydown", this.handleKeyDown);
		element.addEventListener("copy", this.handleCopyEvent);
		element.addEventListener("cut", this.handleCutEvent);
		element.addEventListener("dragstart", this.handleDragStart);
		element.addEventListener("drop", this.handleDrop);
		element.ownerDocument?.addEventListener(
			"selectionchange",
			this.handleSelectionChange,
		);

		const selection = this.editor.selection;
		if (selection?.type === "text") {
			this.isApplyingSelection = true;
			element.focus({ preventScroll: true });
			editorSelectionToDOM(element, selection.anchor, selection.focus);
			requestAnimationFrame(() => {
				this.isApplyingSelection = false;
			});
			return;
		}

		element.focus({ preventScroll: true });
		this.isApplyingSelection = false;
	}

	deactivate(): void {
		this.clearObservedBlocks();
		if (this.element) {
			this.element.contentEditable = "false";
			this.element.removeAttribute("tabindex");
			this.element.removeEventListener(
				"beforeinput",
				this.handleBeforeInput,
			);
			this.element.removeEventListener("keydown", this.handleKeyDown);
			this.element.removeEventListener("copy", this.handleCopyEvent);
			this.element.removeEventListener("cut", this.handleCutEvent);
			this.element.removeEventListener("dragstart", this.handleDragStart);
			this.element.removeEventListener("drop", this.handleDrop);
			this.element.ownerDocument?.removeEventListener(
				"selectionchange",
				this.handleSelectionChange,
			);
		}

		this.element = null;
	}

	updateSelection(_relPos: unknown): void {
		if (!this.element) return;
		this.syncObservedBlocks();
		this.projectCurrentSelection();
	}

	private projectCurrentSelection(): void {
		if (!this.element) return;
		const selection = this.editor.selection;
		if (selection?.type !== "text") return;
		this.isApplyingSelection = true;
		editorSelectionToDOM(this.element, selection.anchor, selection.focus);
		requestAnimationFrame(() => {
			this.isApplyingSelection = false;
		});
	}

	private handleSelectionChange = (): void => {
		if (!this.element) return;
		if (this.isApplyingSelection) return;

		const selection = domSelectionToEditor(this.element);
		if (!selection) return;

		if (selection.anchor.blockId === selection.focus.blockId) {
			if (selection.anchor.blockId === this.fieldEditor.focusBlockId) {
				this.fieldEditor.syncTextSelection(
					selection.anchor.blockId,
					selection.anchor.offset,
					selection.focus.offset,
				);
				return;
			}

			this.fieldEditor.activateTextSelection(
				selection.anchor.blockId,
				selection.anchor.offset,
				selection.focus.offset,
			);
			return;
		}

		this.editor.selectTextRange(selection.anchor, selection.focus);
	};

	private syncObservedBlocks(): void {
		if (!this.element) return;

		const nextBlockIds = new Set(
			this.fieldEditor.activeBlockIds.filter(
				(blockId) =>
					getExpandedBlockRole(this.editor, blockId) ===
					"editable-inline",
			),
		);

		for (const [blockId, observed] of this.observedBlocks) {
			if (nextBlockIds.has(blockId)) continue;
			observed.ytext.unobserve(observed.handler);
			this.observedBlocks.delete(blockId);
		}

		for (const blockId of nextBlockIds) {
			if (this.observedBlocks.has(blockId)) continue;
			const ytext = getBlockText(this.editor, blockId);
			if (!ytext) continue;

			const handler = (event: { delta?: unknown[] }) => {
				this.reconcileObservedBlock(blockId, ytext, event.delta);
			};

			this.reconcileObservedBlock(blockId, ytext);
			ytext.observe(handler);
			this.observedBlocks.set(blockId, { ytext, handler });
		}
	}

	private clearObservedBlocks(): void {
		for (const [, observed] of this.observedBlocks) {
			observed.ytext.unobserve(observed.handler);
		}
		this.observedBlocks.clear();
	}

	private reconcileObservedBlock(
		blockId: string,
		ytext: any,
		delta?: unknown[],
	): void {
		if (!this.element) return;

		const inlineEl = this.element.querySelector(
			`[data-block-id="${blockId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		if (!inlineEl) return;

		const selection = this.editor.selection;
		const shouldRestoreSelection = selection?.type === "text";

		if (delta != null) {
			const applied = applyDeltaToDOM(
				delta as Array<{
					retain?: number;
					insert?: string;
					delete?: number;
					attributes?: Record<string, unknown>;
				}>,
				inlineEl,
				this.editor.schema,
			);
			if (!applied) {
				fullReconcileToDOM(ytext, inlineEl, this.editor.schema);
			}
		} else {
			fullReconcileToDOM(ytext, inlineEl, this.editor.schema);
		}

		if (shouldRestoreSelection) {
			this.projectCurrentSelection();
		}
	}

	private handleBeforeInput = (event: InputEvent): void => {
		const selection = this.editor.selection;
		if (selection?.type !== "text") return;

		switch (event.inputType) {
			case "insertText":
			case "insertReplacementText": {
				event.preventDefault();
				const text = event.data ?? "";
				if (!text) return;
				this.editor.replaceSelection(text);
				return;
			}
			case "insertParagraph":
			case "insertLineBreak": {
				event.preventDefault();
				this.fieldEditor.deactivate();

				if (selection.isMultiBlock) {
					this.editor.replaceSelection("\n");
					const nextSelection = this.editor.selection;
					if (
						nextSelection?.type === "text" &&
						!nextSelection.isMultiBlock
					) {
						requestAnimationFrame(() => {
							this.fieldEditor.activateTextSelection(
								nextSelection.anchor.blockId,
								nextSelection.anchor.offset,
								nextSelection.focus.offset,
							);
						});
					}
					return;
				}

				const blockId = selection.anchor.blockId;
				const ytext = getBlockText(this.editor, blockId);
				if (!ytext) return;

				const target = applyEnterBehavior(this.editor, {
					blockId,
					inputMode: this.fieldEditor.inputMode,
					ytext,
					range: {
						start: Math.min(
							selection.anchor.offset,
							selection.focus.offset,
						),
						end: Math.max(
							selection.anchor.offset,
							selection.focus.offset,
						),
					},
				});
				if (!target) return;

				requestAnimationFrame(() => {
					this.fieldEditor.activateTextSelection(
						target.blockId,
						target.anchorOffset,
						target.focusOffset,
					);
				});
				return;
			}
			case "deleteContentBackward":
			case "deleteContentForward":
			case "deleteByCut": {
				event.preventDefault();
				this.editor.deleteSelection();
				return;
			}
			case "deleteByDrag": {
				// Dragging an active browser selection inside the expanded host can emit
				// deleteByDrag even when the user only intended to extend the range.
				// Ignore it until we support true drag-move semantics for expanded mode.
				event.preventDefault();
				return;
			}
			case "insertFromPaste": {
				event.preventDefault();
				const importers =
					this.editor.internals.getSlot<PasteImporters>(
						"paste:importers",
					);
				handlePaste(
					event,
					this.editor,
					this.fieldEditor,
					importers ?? undefined,
				);
				return;
			}
			case "historyUndo": {
				event.preventDefault();
				this.editor.undoManager.undo();
				return;
			}
			case "historyRedo": {
				event.preventDefault();
				this.editor.undoManager.redo();
				return;
			}
			case "formatBold": {
				event.preventDefault();
				toggleInlineMark(this.editor, "bold");
				return;
			}
			case "formatItalic": {
				event.preventDefault();
				toggleInlineMark(this.editor, "italic");
				return;
			}
			case "formatUnderline": {
				event.preventDefault();
				toggleInlineMark(this.editor, "underline");
				return;
			}
			case "formatStrikeThrough": {
				event.preventDefault();
				toggleInlineMark(this.editor, "strikethrough");
				return;
			}
			default:
				break;
		}
	};

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (
			!event.defaultPrevented &&
			handleSelectAllShortcut(this.editor, event, this.fieldEditor)
		) {
			event.preventDefault();
			return;
		}

		if (
			handleEditorKeyBindings(this.editor, event, {
				includeSelectAll: false,
			})
		) {
			event.preventDefault();
		}
	};

	private handleCopyEvent = (event: ClipboardEvent): void => {
		event.preventDefault();
		handleCopy(this.editor);
	};

	private handleCutEvent = (event: ClipboardEvent): void => {
		event.preventDefault();
		handleCut(this.editor);
	};

	private handleDragStart = (event: DragEvent): void => {
		// Native text dragging inside the shared expanded host conflicts with
		// cross-block selection extension and can cause the browser to move/remove
		// the selected DOM range. Pen does not support drag-move semantics here.
		event.preventDefault();
	};

	private handleDrop = (event: DragEvent): void => {
		event.preventDefault();
	};
}

function getBlockText(editor: Editor, blockId: string): any {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;
	const ydoc = adapter.raw(doc) as any;
	return ydoc.getMap("blocks").get(blockId)?.get("content");
}
