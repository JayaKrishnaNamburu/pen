import type { Editor } from "@pen/types";
import type { FieldEditorInputController } from "./controller";
import type { FieldEditorTextLike } from "./crdt";
import type { PasteImporters } from "../types/paste";
import {
	applyDeleteBehavior,
	applyEnterBehavior,
	toggleInlineMark,
} from "./commands";
import { handlePaste } from "./clipboard";
import { staticRangeToOffsets } from "./contenteditableDomHelpers";

export interface ContentEditableDirectInputBackend {
	resolveCurrentInputRange(): { start: number; end: number } | null;
	applyListInputRule(options: {
		blockId: string;
		range: { start: number; end: number };
		text: string;
	}): boolean;
	applyInlineTextEdit(options: {
		blockId: string;
		range: { start: number; end: number };
		text: string;
		marks?: Record<string, unknown>;
	}): void;
}

export type DirectHandler = (
	event: InputEvent,
	editor: Editor,
	ytext: FieldEditorTextLike,
	fieldEditor: FieldEditorInputController,
	element: HTMLElement,
	backend: ContentEditableDirectInputBackend,
) => void;

export const DIRECT_HANDLERS: Record<string, DirectHandler> = {
	insertText: (event, editor, ytext, fe, element, backend) => {
		const text = event.data ?? "";
		if (!text) return;
		if (hasMultiBlockTextSelection(editor)) {
			editor.replaceSelection(text);
			return;
		}
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (!range) return;
		if (backend.applyListInputRule({ blockId, range, text })) {
			return;
		}
		const marks = fe.resolveInsertMarks(ytext, range.start);
		backend.applyInlineTextEdit({
			blockId,
			range,
			text,
			marks,
		});
	},

	insertReplacementText: (event, editor, ytext, fe, element, backend) => {
		const text = event.data ?? "";
		if (!text) return;
		if (hasMultiBlockTextSelection(editor)) {
			editor.replaceSelection(text);
			return;
		}
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const targetRanges = event.getTargetRanges?.();
		const range = targetRanges?.length
			? staticRangeToOffsets(targetRanges[0], element)
			: backend.resolveCurrentInputRange();
		if (!range) return;
		if (backend.applyListInputRule({ blockId, range, text })) {
			return;
		}
		const marks = fe.resolveInsertMarks(ytext, range.start);
		backend.applyInlineTextEdit({
			blockId,
			range,
			text,
			marks,
		});
	},

	deleteContentBackward: (_event, editor, ytext, fe, element, backend) => {
		if (hasMultiBlockTextSelection(editor)) {
			editor.deleteSelection();
			return;
		}
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (!range) return;

		const target = applyDeleteBehavior(editor, {
			blockId,
			ytext,
			range,
			direction: "backward",
		});
		if (target) {
			if (target.selectBlock) {
				fe.deactivate();
				editor.selectBlock(target.blockId);
			} else {
				fe.activateTextSelection(
					target.blockId,
					target.anchorOffset,
					target.focusOffset,
				);
			}
			return;
		}

		if (range.start !== range.end) {
			backend.applyInlineTextEdit({
				blockId,
				range,
				text: "",
			});
			return;
		}

		if (range.start > 0) {
			backend.applyInlineTextEdit({
				blockId,
				range: { start: range.start - 1, end: range.start },
				text: "",
			});
		}
	},

	deleteContentForward: (_event, editor, ytext, fe, element, backend) => {
		if (hasMultiBlockTextSelection(editor)) {
			editor.deleteSelection();
			return;
		}
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (!range) return;

		const target = applyDeleteBehavior(editor, {
			blockId,
			ytext,
			range,
			direction: "forward",
		});
		if (target) {
			if (target.selectBlock) {
				fe.deactivate();
				editor.selectBlock(target.blockId);
			} else {
				fe.activateTextSelection(
					target.blockId,
					target.anchorOffset,
					target.focusOffset,
				);
			}
			return;
		}

		if (range.start < ytext.length) {
			backend.applyInlineTextEdit({
				blockId,
				range: { start: range.start, end: range.start + 1 },
				text: "",
			});
		}
	},

	deleteByCut: (_event, editor, _ytext, fe, element, backend) => {
		if (hasMultiBlockTextSelection(editor)) {
			editor.deleteSelection();
			return;
		}
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (!range || range.start === range.end) return;

		backend.applyInlineTextEdit({
			blockId,
			range,
			text: "",
		});
	},

	deleteWordBackward: (_event, editor, ytext, fe, element, backend) => {
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (!range) return;

		if (range.start !== range.end) {
			backend.applyInlineTextEdit({
				blockId,
				range,
				text: "",
			});
			return;
		}

		const text = ytext.toString();
		let pos = range.start;
		while (pos > 0 && /\s/.test(text[pos - 1])) pos--;
		while (pos > 0 && !/\s/.test(text[pos - 1])) pos--;
		if (pos < range.start) {
			backend.applyInlineTextEdit({
				blockId,
				range: { start: pos, end: range.start },
				text: "",
			});
		}
	},

	deleteWordForward: (_event, editor, ytext, fe, element, backend) => {
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (!range) return;

		if (range.start !== range.end) {
			backend.applyInlineTextEdit({
				blockId,
				range,
				text: "",
			});
			return;
		}

		const text = ytext.toString();
		let pos = range.end;
		while (pos < text.length && /\s/.test(text[pos])) pos++;
		while (pos < text.length && !/\s/.test(text[pos])) pos++;
		if (pos > range.end) {
			backend.applyInlineTextEdit({
				blockId,
				range: { start: range.end, end: pos },
				text: "",
			});
		}
	},

	insertParagraph: (_event, editor, ytext, fe, element, backend) => {
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: fe.inputMode,
			ytext,
			range: backend.resolveCurrentInputRange(),
		});
		if (!target) return;

		fe.activateTextSelection(
			target.blockId,
			target.anchorOffset,
			target.focusOffset,
		);
	},

	insertLineBreak: (_event, _editor, ytext, fe, element, backend) => {
		const range = backend.resolveCurrentInputRange();
		if (!range) return;
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		backend.applyInlineTextEdit({
			blockId,
			range,
			text: "\n",
			marks: fe.resolveInsertMarks(ytext, range.start),
		});
	},

	historyUndo: (_event, editor) => {
		editor.undoManager.undo();
	},

	historyRedo: (_event, editor) => {
		editor.undoManager.redo();
	},

	insertFromPaste: (event, editor, _ytext, fe) => {
		const importers =
			editor.internals.getSlot<PasteImporters>("paste:importers");
		handlePaste(event, editor, fe, importers ?? undefined);
	},

	formatBold: (_event, editor) => {
		toggleInlineMark(editor, "bold");
	},

	formatItalic: (_event, editor) => {
		toggleInlineMark(editor, "italic");
	},

	formatUnderline: (_event, editor) => {
		toggleInlineMark(editor, "underline");
	},

	formatStrikeThrough: (_event, editor) => {
		toggleInlineMark(editor, "strikethrough");
	},
};

function hasMultiBlockTextSelection(editor: Editor): boolean {
	const selection = editor.selection;
	return selection?.type === "text" && selection.isMultiBlock;
}
