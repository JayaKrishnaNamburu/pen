import type { Command, Editor, SelectionState } from "@input/pen-types";

import type { BlockDirection } from "../direction/firstStrong";
import { resolveBlockDirection } from "../direction/resolve";
import { caretLeft, caretRight, caretWordLeft, caretWordRight } from "./caret";
import type { DefaultKeymapBinding } from "./defaultKeymap";

/**
 * K1 / M2: remap a matched keymap binding for the focus block's resolved
 * direction. Command handlers stay logical; only the dispatched command
 * changes. Intended once per keystroke on the matched binding — direction
 * comes from the DIR1 fingerprint cache, not a geometry measure.
 */
export function resolveDirectedBinding(
	editor: Editor,
	binding: DefaultKeymapBinding,
): DefaultKeymapBinding {
	const direction = resolveFocusBlockDirection(editor);
	if (direction !== "rtl") {
		return binding;
	}
	return applyDirectedBinding(binding, direction);
}

/** DIR1-cached resolved direction of the focus block, or null if none. */
export function resolveFocusBlockDirection(
	editor: Editor,
): BlockDirection | null {
	const blockId = focusBlockId(editor.selection);
	if (!blockId) {
		return null;
	}
	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}
	return resolveBlockDirection(editor, block);
}

/**
 * Pure M2 / M4 command swap. `pen.caretLeft/Right` and word variants flip
 * under rtl; line, vertical, and delete commands are untouched.
 */
export function resolveDirectedCommand<P>(
	command: Command<P>,
	direction: BlockDirection,
): Command<P> {
	if (direction !== "rtl") {
		return command;
	}
	switch (command.name) {
		case caretLeft.name:
			return caretRight as Command<P>;
		case caretRight.name:
			return caretLeft as Command<P>;
		case caretWordLeft.name:
			return caretWordRight as Command<P>;
		case caretWordRight.name:
			return caretWordLeft as Command<P>;
		default:
			return command;
	}
}

export function applyDirectedBinding(
	binding: DefaultKeymapBinding,
	direction: BlockDirection,
): DefaultKeymapBinding {
	const command = resolveDirectedCommand(binding.command, direction);
	if (command === binding.command) {
		return binding;
	}
	return { ...binding, command };
}

function focusBlockId(selection: SelectionState): string | null {
	if (!selection) {
		return null;
	}
	switch (selection.type) {
		case "text":
			return selection.focus.blockId;
		case "block":
			return selection.blockIds[selection.blockIds.length - 1] ?? null;
		case "cell":
			return selection.blockId;
		case "app":
			return null;
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}
