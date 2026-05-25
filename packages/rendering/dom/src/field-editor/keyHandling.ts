import { getInlineCompletionController } from "@pen/core";
import type { Editor } from "@pen/types";
import type { FieldEditorKeyboardController } from "./controller";
import {
	applyDeleteBehavior,
	applyEnterBehavior,
	applyListTabBehavior,
	moveCaretAcrossBlocks,
	type SelectionRange,
} from "./commands";
import { getAutocompleteController } from "../utils/autocompleteController";
import { selectInlineAtomWithArrowKey } from "./keyHandlingInlineAtoms";
import {
	collectKeyBindings,
	getDocumentTextRange,
	isRedoShortcut,
	isSelectAllShortcut,
	isUndoShortcut,
	matchesBindingContext,
	matchesKey,
	tryHandleHistoryOverrideBinding,
} from "./keyBindingShortcuts";

export function handleFieldEditorKeyDown(options: {
	event: KeyboardEvent;
	editor: Editor;
	fieldEditor: FieldEditorKeyboardController;
	ytext: {
		length: number;
		toString(): string;
		toDelta(): Array<{ insert?: string | Record<string, unknown> }>;
		insert(offset: number, text: string): void;
		delete(offset: number, length: number): void;
	};
	range: SelectionRange | null;
}): boolean {
	const { event, editor, fieldEditor, ytext, range } = options;
	const blockId = fieldEditor.focusBlockId;
	if (!blockId) return false;
	const autocomplete = getAutocompleteController(editor);

	if (shouldDismissAutocompleteOnKeyDown(event, autocomplete)) {
		autocomplete?.dismiss("typing");
	}

	if (!event.defaultPrevented && handleHistoryShortcut(editor, event)) {
		return true;
	}

	if (
		!event.defaultPrevented &&
		handleSelectAllShortcut(editor, event, fieldEditor)
	) {
		return true;
	}

	if (fieldEditor.activeCellCoord) {
		if (
			event.key === "Tab" &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey
		) {
			event.preventDefault();
			const coord = fieldEditor.activeCellCoord;
			if (!coord) return true;
			const block = editor.getBlock(coord.blockId);
			if (block) {
				const rowCount = block.tableRowCount();
				const colCount = block.tableColumnCount();
				let nextRow = coord.row;
				let nextCol = coord.col;

				if (event.shiftKey) {
					nextCol--;
					if (nextCol < 0) {
						nextRow--;
						nextCol = colCount - 1;
					}
					if (nextRow < 0) {
						nextRow = 0;
						nextCol = 0;
					}
				} else {
					nextCol++;
					if (nextCol >= colCount) {
						nextRow++;
						nextCol = 0;
					}
					if (nextRow >= rowCount) {
						nextRow = rowCount - 1;
						nextCol = colCount - 1;
					}
				}

				fieldEditor.activateCell(coord.blockId, nextRow, nextCol);
			}
			return true;
		}

		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey
		) {
			event.preventDefault();
			const coord = fieldEditor.activeCellCoord;
			if (!coord) return true;
			const block = editor.getBlock(coord.blockId);
			if (block) {
				const rowCount = block.tableRowCount();
				const nextRow = Math.min(coord.row + 1, rowCount - 1);
				fieldEditor.activateCell(coord.blockId, nextRow, coord.col);
			}
			return true;
		}

		if (
			event.key === "ArrowLeft" ||
			event.key === "ArrowRight" ||
			event.key === "ArrowUp" ||
			event.key === "ArrowDown"
		) {
			return false;
		}
	}

	if (
		event.key === "Tab" &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.altKey
	) {
		const target = applyListTabBehavior(editor, {
			blockId,
			ytext,
			range,
			shiftKey: event.shiftKey,
		});
		if (target) {
			fieldEditor.activateTextSelection(
				target.blockId,
				target.anchorOffset,
				target.focusOffset,
			);
			return true;
		}

		const inlineCompletion = getInlineCompletionController(editor);
		if (inlineCompletion?.hasVisibleSuggestion()) {
			event.preventDefault();
			if (autocomplete?.hasVisibleSuggestion()) {
				return autocomplete.acceptVisibleSuggestion();
			}
			const accepted = inlineCompletion.acceptSuggestion();
			if (accepted) {
				syncAcceptedInlineCompletionSelection(editor, fieldEditor);
			}
			return accepted;
		}

		if (!event.shiftKey) {
			if (autocomplete?.request({ explicit: true })) {
				event.preventDefault();
				return true;
			}
		}
	}

	if (
		(event.key === "Backspace" || event.key === "Delete") &&
		!event.shiftKey &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.altKey
	) {
		const target = applyDeleteBehavior(editor, {
			blockId,
			ytext,
			range,
			direction: event.key === "Backspace" ? "backward" : "forward",
		});
		if (target) {
			if (target.selectBlock) {
				fieldEditor.deactivate();
				editor.selectBlock(target.blockId);
			} else {
				fieldEditor.activateTextSelection(
					target.blockId,
					target.anchorOffset,
					target.focusOffset,
				);
			}
			return true;
		}
	}

	if (event.key === "Enter" && !event.shiftKey) {
		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: fieldEditor.inputMode,
			ytext,
			range,
		});
		if (!target) return false;

		fieldEditor.activateTextSelection(
			target.blockId,
			target.anchorOffset,
			target.focusOffset,
		);
		return true;
	}

	if (
		(event.key === "ArrowLeft" || event.key === "ArrowUp") &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.altKey
	) {
		if (
			event.key === "ArrowLeft" &&
			selectInlineAtomWithArrowKey({
				blockId,
				editor,
				event,
				fieldEditor,
				range,
				ytext,
			})
		) {
			return true;
		}

		if (event.shiftKey) {
			return false;
		}

		const target = moveCaretAcrossBlocks(editor, {
			blockId,
			ytext,
			range,
			direction: "previous",
		});
		if (target) {
			if (target.selectBlock) {
				fieldEditor.deactivate();
				editor.selectBlock(target.blockId);
			} else {
				fieldEditor.activateTextSelection(
					target.blockId,
					target.anchorOffset,
					target.focusOffset,
				);
			}
			return true;
		}
	}

	if (
		(event.key === "ArrowRight" || event.key === "ArrowDown") &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.altKey
	) {
		if (
			event.key === "ArrowRight" &&
			selectInlineAtomWithArrowKey({
				blockId,
				editor,
				event,
				fieldEditor,
				range,
				ytext,
			})
		) {
			return true;
		}

		if (event.shiftKey) {
			return false;
		}

		const target = moveCaretAcrossBlocks(editor, {
			blockId,
			ytext,
			range,
			direction: "next",
		});
		if (target) {
			if (target.selectBlock) {
				fieldEditor.deactivate();
				editor.selectBlock(target.blockId);
			} else {
				fieldEditor.activateTextSelection(
					target.blockId,
					target.anchorOffset,
					target.focusOffset,
				);
			}
			return true;
		}
	}

	return handleEditorKeyBindings(editor, event, { includeSelectAll: false });
}


function syncAcceptedInlineCompletionSelection(
	editor: Editor,
	fieldEditor: FieldEditorKeyboardController,
): void {
	const selection = editor.selection;
	if (
		selection?.type !== "text" ||
		!selection.isCollapsed ||
		selection.isMultiBlock
	) {
		return;
	}

	const blockId = selection.focus.blockId;
	const offset = selection.focus.offset;
	if (typeof fieldEditor.commitProgrammaticTextSelection === "function") {
		fieldEditor.commitProgrammaticTextSelection(blockId, offset, offset);
		return;
	}

	fieldEditor.activateTextSelection(blockId, offset, offset);
}

function shouldDismissAutocompleteOnKeyDown(
	event: KeyboardEvent,
	autocomplete: ReturnType<typeof getAutocompleteController>,
): boolean {
	if (!autocomplete?.hasVisibleSuggestion()) {
		return false;
	}
	if (event.metaKey || event.ctrlKey || event.altKey) {
		return false;
	}
	return (
		event.key.length === 1 ||
		event.key === "Backspace" ||
		event.key === "Delete" ||
		event.key === "Enter"
	);
}

export function handleEditorKeyBindings(
	editor: Editor,
	event: KeyboardEvent,
	options?: { includeSelectAll?: boolean },
): boolean {
	if (event.defaultPrevented) {
		return false;
	}

	const includeSelectAll = options?.includeSelectAll ?? true;
	if (handleHistoryShortcut(editor, event)) {
		return true;
	}

	if (includeSelectAll && handleSelectAllShortcut(editor, event)) {
		return true;
	}

	const bindings = collectKeyBindings(editor);
	for (const binding of bindings) {
		if (
			matchesBindingContext(editor, binding.context) &&
			matchesKey(binding.key, event) &&
			binding.handler(editor, event)
		) {
			return true;
		}
	}

	return false;
}

export function handleSelectAllShortcut(
	editor: Editor,
	event: KeyboardEvent,
	fieldEditor?: FieldEditorKeyboardController,
	options?: { rootElement?: HTMLElement | null },
): boolean {
	if (!isSelectAllShortcut(event)) {
		return false;
	}

	if (fieldEditor) {
		return fieldEditor.selectAll(options?.rootElement);
	}

	const range = getDocumentTextRange(editor);
	if (!range) {
		return true;
	}
	editor.selectTextRange(range.start, range.end);
	return true;
}

export function handleHistoryShortcut(
	editor: Editor,
	event: KeyboardEvent,
): boolean {
	if (tryHandleHistoryOverrideBinding(editor, event)) {
		return true;
	}

	if (isUndoShortcut(event)) {
		editor.undoManager.undo();
		return true;
	}

	if (isRedoShortcut(event)) {
		editor.undoManager.redo();
		return true;
	}

	return false;
}
