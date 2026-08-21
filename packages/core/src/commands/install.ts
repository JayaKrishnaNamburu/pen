import type { Editor, SelectionState } from "@input/pen-types";

import { builtinCommandHandlers } from "./builtin";
import {
	createCommandRegistry,
	type CommandRegistry,
} from "./registry";

const registries = new WeakMap<Editor, CommandRegistry>();

export function applyCommandSelection(
	editor: Editor,
	selection: SelectionState,
): void {
	if (!selection) {
		editor.setSelection(null);
		return;
	}
	switch (selection.type) {
		case "text":
			editor.selectTextRange(selection.anchor, selection.focus);
			return;
		case "block":
			editor.selectBlocks([...selection.blockIds]);
			return;
		case "cell":
			editor.selectCellRange(
				selection.blockId,
				selection.anchor,
				selection.head,
			);
			return;
		case "app":
			editor.setSelection(selection);
			return;
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}

export function installEditorCommandRegistry(editor: Editor): CommandRegistry {
	const existing = registries.get(editor);
	if (existing) {
		return existing;
	}
	const registry = createCommandRegistry({
		editor,
		providers: builtinCommandHandlers(),
		apply: (ops, options) => {
			editor.apply(ops, options);
		},
		setSelection: (selection) => {
			applyCommandSelection(editor, selection);
		},
	});
	registries.set(editor, registry);
	return registry;
}

export function getCommandRegistry(editor: Editor): CommandRegistry | undefined {
	return registries.get(editor);
}
