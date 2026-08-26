import type { Editor, SelectionOrigin, SelectionState } from "@input/pen-types";

import { builtinCommandHandlers } from "./builtin";
import { createCommandRegistry, type CommandRegistry } from "./registry";

const registries = new WeakMap<Editor, CommandRegistry>();

export function applyCommandSelection(
	editor: Editor,
	selection: SelectionState,
	origin: SelectionOrigin = "programmatic",
): void {
	const write = editor as Editor & {
		setSelection(
			next: SelectionState,
			options?: { origin?: SelectionOrigin },
		): void;
	};
	write.setSelection(selection, { origin });
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
		setSelection: (selection, origin) => {
			applyCommandSelection(editor, selection, origin);
		},
	});
	registries.set(editor, registry);
	return registry;
}

export function getCommandRegistry(
	editor: Editor,
): CommandRegistry | undefined {
	return registries.get(editor);
}
