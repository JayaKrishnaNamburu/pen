import {
	getInlineAtomAtOffset,
	replaceInlineAtomWithText,
	type InlineAtomSnapshot,
	type InlineAtomDropTarget,
} from "@pen/dom/field-editor/inlineAtomInteraction";
import type { Editor } from "@pen/types";
import { getAttachedFieldEditor } from "../../utils/fieldEditor";
import type { FieldEditorSession } from "../../field-editor/controller";
import type {
	InlineAtomMoveRejectedEvent,
	ResolvedInlineAtomInteractions,
} from "../../context/editorContext";
import type { InlineAtomWrapperInteractionOptions } from "./inlineAtomInteraction";

export function destructureInlineAtom(
	options: InlineAtomWrapperInteractionOptions,
): boolean {
	const atom = getInlineAtomAtOffset(options.editor, {
		blockId: options.blockId,
		offset: options.offset,
	});
	if (!atom) {
		notifyRejected(options, { reason: "stale-source" });
		return false;
	}

	const text = resolveDestructureText(options.interactions.destructure, atom);
	if (text == null) {
		return false;
	}

	const didReplace = replaceInlineAtomWithText({
		source: {
			editor: options.editor,
			blockId: options.blockId,
			offset: options.offset,
		},
		text,
		selection: "end",
	});
	if (!didReplace) {
		return false;
	}

	options.interactions.onAfterDestructure?.({
		editor: options.editor,
		atom,
		blockId: options.blockId,
		startOffset: options.offset,
		endOffset: options.offset + text.length,
		text,
	});
	const fieldEditor = getAttachedFieldEditor(
		options.editor,
	) as FieldEditorSession | null;
	requestAnimationFrame(() => {
		fieldEditor?.activateTextSelection(
			options.blockId,
			options.offset + text.length,
			options.offset + text.length,
		);
		fieldEditor?.focus();
	});
	return true;
}

export function resolveShiftClickInlineAtomSelection(
	editor: Editor,
	blockId: string,
	atomOffset: number,
): { blockId: string; anchorOffset: number; focusOffset: number } {
	const atomStart = atomOffset;
	const atomEnd = atomOffset + 1;
	const selection = editor.selection;
	if (
		selection?.type !== "text" ||
		selection.isMultiBlock ||
		selection.anchor.blockId !== blockId ||
		selection.focus.blockId !== blockId
	) {
		return {
			blockId,
			anchorOffset: atomStart,
			focusOffset: atomEnd,
		};
	}

	const selectionStart = Math.min(
		selection.anchor.offset,
		selection.focus.offset,
	);
	const selectionEnd = Math.max(
		selection.anchor.offset,
		selection.focus.offset,
	);
	if (!selection.isCollapsed) {
		if (atomEnd <= selectionStart) {
			return {
				blockId,
				anchorOffset: selectionEnd,
				focusOffset: atomStart,
			};
		}
		if (atomStart >= selectionEnd) {
			return {
				blockId,
				anchorOffset: selectionStart,
				focusOffset: atomEnd,
			};
		}
		if (atomStart === selectionStart && atomEnd === selectionEnd) {
			return {
				blockId,
				anchorOffset: atomEnd,
				focusOffset: atomEnd,
			};
		}
		if (atomStart === selectionStart) {
			return {
				blockId,
				anchorOffset: selectionEnd,
				focusOffset: atomEnd,
			};
		}
		if (atomEnd === selectionEnd) {
			return {
				blockId,
				anchorOffset: selectionStart,
				focusOffset: atomStart,
			};
		}
		return {
			blockId,
			anchorOffset: selection.anchor.offset,
			focusOffset: selection.focus.offset,
		};
	}

	const anchorOffset = selection.anchor.offset;
	return {
		blockId,
		anchorOffset,
		focusOffset: anchorOffset <= atomStart ? atomEnd : atomStart,
	};
}

export function selectInlineAtomRangeFromShiftClick(
	options: InlineAtomWrapperInteractionOptions,
): boolean {
	const target = resolveShiftClickInlineAtomSelection(
		options.editor,
		options.blockId,
		options.offset,
	);
	const fieldEditor = getAttachedFieldEditor(
		options.editor,
	) as FieldEditorSession | null;
	if (fieldEditor?.activateTextSelection) {
		fieldEditor.activateTextSelection(
			target.blockId,
			target.anchorOffset,
			target.focusOffset,
		);
		fieldEditor.focus();
		return true;
	}

	options.editor.selectText(
		target.blockId,
		target.anchorOffset,
		target.focusOffset,
	);
	return true;
}

export function canDestructure(options: InlineAtomWrapperInteractionOptions): boolean {
	return options.interactions.destructure !== false;
}

function resolveDestructureText(
	destructure: ResolvedInlineAtomInteractions["destructure"],
	atom: InlineAtomSnapshot,
): string | null | undefined {
	if (typeof destructure === "function") {
		return destructure(atom);
	}
	if (destructure === true) {
		return atom.text;
	}
	if (destructure && typeof destructure === "object") {
		return destructure[atom.type]?.(atom);
	}
	return null;
}

export function notifyRejected(
	options: InlineAtomWrapperInteractionOptions,
	event: {
		target?: InlineAtomDropTarget;
		atom?: InlineAtomSnapshot;
		reason: InlineAtomMoveRejectedEvent["reason"];
	},
): void {
	options.interactions.onMoveRejected?.({
		source: {
			editor: options.editor,
			blockId: options.blockId,
			offset: options.offset,
		},
		...event,
	});
}
