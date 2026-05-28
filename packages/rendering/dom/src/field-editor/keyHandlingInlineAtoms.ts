import type { Editor } from "@pen/types";
import type { FieldEditorKeyboardController } from "./controller";
import {
	normalizeInlineRange,
	type SelectionRange,
} from "./commands";
import {
	getInlineAtomRangeAtOffset,
	isInlineAtomRange,
} from "./inlineAtomModel";

export function selectInlineAtomWithArrowKey(options: {
	blockId: string;
	editor: Editor;
	event: KeyboardEvent;
	fieldEditor: FieldEditorKeyboardController;
	range: SelectionRange | null;
	ytext: {
		length: number;
		toString(): string;
		toDelta(): Array<{ insert?: string | Record<string, unknown> }>;
	};
}): boolean {
	const { blockId, editor, event, fieldEditor, ytext } = options;
	const range = normalizeInlineRange(ytext, options.range);
	if (!range) {
		return false;
	}

	const direction = event.key === "ArrowLeft" ? "previous" : "next";
	if (event.shiftKey) {
		return extendInlineAtomSelectionWithArrowKey({
			blockId,
			direction,
			editor,
			fieldEditor,
			range,
			ytext,
		});
	}

	if (range.start !== range.end) {
		if (!isInlineAtomRange(ytext, range.start, range.end)) {
			return false;
		}
		const offset = direction === "previous" ? range.start : range.end;
		fieldEditor.activateTextSelection(blockId, offset, offset);
		return true;
	}

	const atomOffset = direction === "previous" ? range.start - 1 : range.start;
	const atomRange = getInlineAtomRangeAtOffset(ytext, atomOffset);
	if (!atomRange) {
		return false;
	}

	fieldEditor.activateTextSelection(blockId, atomRange.start, atomRange.end);
	return true;
}

function extendInlineAtomSelectionWithArrowKey(options: {
	blockId: string;
	direction: "previous" | "next";
	editor: Editor;
	fieldEditor: FieldEditorKeyboardController;
	range: SelectionRange;
	ytext: {
		toDelta(): Array<{ insert?: string | Record<string, unknown> }>;
	};
}): boolean {
	const { blockId, direction, editor, fieldEditor, range, ytext } = options;
	const selection = editor.selection;
	if (
		selection?.type === "text" &&
		!selection.isCollapsed &&
		!selection.isMultiBlock &&
		selection.anchor.blockId === blockId &&
		selection.focus.blockId === blockId
	) {
		const focusAtomOffset =
			direction === "previous"
				? selection.focus.offset - 1
				: selection.focus.offset;
		const focusAtomRange = getInlineAtomRangeAtOffset(
			ytext,
			focusAtomOffset,
		);
		if (focusAtomRange) {
			const nextFocusOffset =
				direction === "previous"
					? focusAtomRange.start
					: focusAtomRange.end;
			fieldEditor.activateTextSelection(
				blockId,
				selection.anchor.offset,
				nextFocusOffset,
			);
			return true;
		}
	}

	if (range.start === range.end) {
		const atomOffset =
			direction === "previous" ? range.start - 1 : range.end;
		const atomRange = getInlineAtomRangeAtOffset(ytext, atomOffset);
		if (!atomRange) {
			return false;
		}
		const anchorOffset =
			direction === "previous" ? atomRange.end : atomRange.start;
		const focusOffset =
			direction === "previous" ? atomRange.start : atomRange.end;
		fieldEditor.activateTextSelection(blockId, anchorOffset, focusOffset);
		return true;
	}

	const atomOffset = direction === "previous" ? range.start - 1 : range.end;
	const atomRange = getInlineAtomRangeAtOffset(ytext, atomOffset);
	if (!atomRange) {
		return false;
	}

	const anchorOffset =
		direction === "previous" ? atomRange.start : range.start;
	const focusOffset = direction === "previous" ? range.end : atomRange.end;
	fieldEditor.activateTextSelection(blockId, anchorOffset, focusOffset);
	return true;
}
