import {
	getCommandRegistry,
	type CommandDispatchContext,
} from "@input/pen-core";
import type { Command, Editor, SelectionState } from "@input/pen-types";

export interface FieldEditorCommandTarget {
	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	deactivate(): void;
	activateCell?(blockId: string, row: number, col: number): void;
}

export function dispatchEditorCommand<P>(
	editor: Editor,
	command: Command<P>,
	param: P,
	context?: CommandDispatchContext,
): boolean {
	const registry = getCommandRegistry(editor);
	if (!registry) {
		return false;
	}
	return registry.dispatch(command, param, {
		origin: "user",
		...context,
	});
}

export function syncEditorTextSelection(
	editor: Editor,
	blockId: string,
	range: { start: number; end: number } | null,
): void {
	if (!range) {
		return;
	}
	const selection = editor.selection;
	if (selection?.type === "text" && selection.isMultiBlock) {
		return;
	}
	if (
		selection?.type === "text" &&
		selection.anchor.blockId === blockId &&
		selection.focus.blockId === blockId &&
		selection.anchor.offset === range.start &&
		selection.focus.offset === range.end
	) {
		return;
	}
	editor.selectText(blockId, range.start, range.end);
}

export function activateFieldEditorFromSelection(
	editor: Editor,
	fieldEditor: FieldEditorCommandTarget,
): void {
	const selection = editor.selection;
	if (!selection) {
		return;
	}
	switch (selection.type) {
		case "text":
			if (selection.isMultiBlock) {
				fieldEditor.deactivate();
				return;
			}
			fieldEditor.activateTextSelection(
				selection.focus.blockId,
				selection.anchor.offset,
				selection.focus.offset,
			);
			return;
		case "block":
			fieldEditor.deactivate();
			return;
		case "cell":
			fieldEditor.activateCell?.(
				selection.blockId,
				selection.head.row,
				selection.head.col,
			);
			return;
		case "app":
			return;
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}

export function dispatchAndActivate<P>(
	editor: Editor,
	fieldEditor: FieldEditorCommandTarget,
	command: Command<P>,
	param: P,
	context?: CommandDispatchContext,
): boolean {
	if (!dispatchEditorCommand(editor, command, param, context)) {
		return false;
	}
	activateFieldEditorFromSelection(editor, fieldEditor);
	return true;
}

export function keymapContextFromSelection(
	selection: SelectionState,
	activeCell: boolean,
): "text" | "cell" | "block" {
	if (activeCell) {
		return "cell";
	}
	if (!selection) {
		return "text";
	}
	switch (selection.type) {
		case "cell":
			return "cell";
		case "block":
			return "block";
		case "text":
		case "app":
			return "text";
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}
