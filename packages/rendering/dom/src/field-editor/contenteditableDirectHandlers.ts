import {
	deleteBackward,
	deleteForward,
	historyRedo,
	historyUndo,
	insertLineBreak,
	insertText as insertTextCommand,
	isCollapsed,
	isMultiBlock,
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
	splitBlock,
	toggleMark,
} from "@input/pen-core";
import type { Command, Editor } from "@input/pen-types";
import type { FieldEditorInputController } from "./controller";
import type { FieldEditorTextLike } from "./crdt";
import type { PasteImporters } from "../types/paste";
import {
	applyDeleteBehavior,
	applyEnterBehavior,
	toggleInlineMark,
} from "./commands";
import {
	dispatchAndActivate,
	dispatchEditorCommand,
	syncEditorTextSelection,
} from "./commandDispatch";
import { handlePaste } from "./clipboard";
import { staticRangeToOffsets } from "./contenteditableDomHelpers";

export interface ContentEditableDirectInputBackend {
	resolveCurrentInputRange(): { start: number; end: number } | null;
	resolveLiveInputRange?(): { start: number; end: number } | null;
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
	commitDispatchedEdit?(): void;
}

export type DirectHandler = (
	event: InputEvent,
	editor: Editor,
	ytext: FieldEditorTextLike,
	fieldEditor: FieldEditorInputController,
	element: HTMLElement,
	backend: ContentEditableDirectInputBackend,
) => void;

const insertText: DirectHandler = (
	event,
	editor,
	ytext,
	fe,
	_element,
	backend,
) => {
	const text = event.data ?? "";
	if (!text) return;
	if (hasMultiBlockTextSelection(editor)) {
		editor.replaceSelection(text);
		return;
	}
	const blockId = fe.focusBlockId;
	if (!blockId) return;
	const range = resolveFieldInsertRange(
		editor,
		fe,
		backend.resolveCurrentInputRange(),
	);
	if (!range) return;
	if (backend.applyListInputRule({ blockId, range, text })) {
		return;
	}
	const marks = fe.resolveInsertMarks(ytext, range.start);
	if (
		tryDispatchInsert(editor, fe, backend, blockId, range, text, marks)
	) {
		return;
	}
	backend.applyInlineTextEdit({
		blockId,
		range,
		text,
		marks,
	});
};

const deleteLineBackward: DirectHandler = (
	_event,
	editor,
	_ytext,
	fe,
	_element,
	backend,
) => {
	const blockId = fe.focusBlockId;
	if (!blockId) return;
	const range = backend.resolveCurrentInputRange();
	if (!range) return;

	if (
		tryDispatchMapped(editor, fe, backend, deleteBackward, {
			granularity: "line",
		}, range)
	) {
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
			range: { start: 0, end: range.start },
			text: "",
		});
	}
};

// command-policy implementations; preventDefault / allow / block live in BEFOREINPUT_MAP
export const DIRECT_HANDLERS: Record<string, DirectHandler> = {
	insertText,
	insertFromDrop: insertText,

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
		const range = resolveFieldInsertRange(
			editor,
			fe,
			targetRanges?.length
				? staticRangeToOffsets(targetRanges[0], element)
				: backend.resolveCurrentInputRange(),
		);
		if (!range) return;
		if (backend.applyListInputRule({ blockId, range, text })) {
			return;
		}
		const marks = fe.resolveInsertMarks(ytext, range.start);
		if (
			tryDispatchInsert(editor, fe, backend, blockId, range, text, marks)
		) {
			return;
		}
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

		if (
			tryDispatchMapped(editor, fe, backend, deleteBackward, {
				granularity: "grapheme",
			}, range)
		) {
			return;
		}

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

		const start = previousGraphemeBoundary(
			ytext.toString(),
			range.start,
			resolveEditorLocale(editor),
		);
		if (start < range.start) {
			backend.applyInlineTextEdit({
				blockId,
				range: { start, end: range.start },
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

		if (
			tryDispatchMapped(editor, fe, backend, deleteForward, {
				granularity: "grapheme",
			}, range)
		) {
			return;
		}

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

		const start = range.start;
		const end = nextGraphemeBoundary(
			ytext.toString(),
			start,
			resolveEditorLocale(editor),
		);
		if (end > start) {
			backend.applyInlineTextEdit({
				blockId,
				range: { start, end },
				text: "",
			});
		}
	},

	deleteWordBackward: (_event, editor, ytext, fe, element, backend) => {
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (!range) return;

		if (
			tryDispatchMapped(editor, fe, backend, deleteBackward, {
				granularity: "word",
			}, range)
		) {
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

		const start = previousWordBoundary(
			ytext.toString(),
			range.start,
			resolveEditorLocale(editor),
		);
		if (start < range.start) {
			backend.applyInlineTextEdit({
				blockId,
				range: { start, end: range.start },
				text: "",
			});
		}
	},

	deleteSoftLineBackward: deleteLineBackward,
	deleteHardLineBackward: deleteLineBackward,

	deleteWordForward: (_event, editor, ytext, fe, element, backend) => {
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (!range) return;

		if (
			tryDispatchMapped(editor, fe, backend, deleteForward, {
				granularity: "word",
			}, range)
		) {
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

		const end = nextWordBoundary(
			ytext.toString(),
			range.end,
			resolveEditorLocale(editor),
		);
		if (end > range.end) {
			backend.applyInlineTextEdit({
				blockId,
				range: { start: range.end, end },
				text: "",
			});
		}
	},

	insertParagraph: (_event, editor, ytext, fe, element, backend) => {
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		const range = backend.resolveCurrentInputRange();
		if (
			tryDispatchMapped(editor, fe, backend, splitBlock, undefined, range)
		) {
			return;
		}
		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: fe.inputMode,
			ytext,
			range,
		});
		if (!target) return;

		fe.activateTextSelection(
			target.blockId,
			target.anchorOffset,
			target.focusOffset,
		);
	},

	insertLineBreak: (_event, editor, ytext, fe, element, backend) => {
		const range = backend.resolveCurrentInputRange();
		if (!range) return;
		const blockId = fe.focusBlockId;
		if (!blockId) return;
		if (
			tryDispatchMapped(
				editor,
				fe,
				backend,
				insertLineBreak,
				undefined,
				range,
			)
		) {
			return;
		}
		backend.applyInlineTextEdit({
			blockId,
			range,
			text: "\n",
			marks: fe.resolveInsertMarks(ytext, range.start),
		});
	},

	historyUndo: (_event, editor, _ytext, fe, _element, backend) => {
		if (
			tryDispatchMapped(editor, fe, backend, historyUndo, undefined)
		) {
			return;
		}
		editor.undoManager.undo();
	},

	historyRedo: (_event, editor, _ytext, fe, _element, backend) => {
		if (
			tryDispatchMapped(editor, fe, backend, historyRedo, undefined)
		) {
			return;
		}
		editor.undoManager.redo();
	},

	insertFromPaste: (event, editor, _ytext, fe) => {
		const importers =
			editor.internals.getSlot<PasteImporters>("paste:importers");
		handlePaste(event, editor, fe, importers ?? undefined);
	},

	formatBold: (_event, editor, _ytext, fe) => {
		if (tryDispatchMarkToggle(editor, fe, "bold")) {
			return;
		}
		toggleInlineMark(editor, "bold");
	},

	formatItalic: (_event, editor, _ytext, fe) => {
		if (tryDispatchMarkToggle(editor, fe, "italic")) {
			return;
		}
		toggleInlineMark(editor, "italic");
	},

	formatUnderline: (_event, editor, _ytext, fe) => {
		if (tryDispatchMarkToggle(editor, fe, "underline")) {
			return;
		}
		toggleInlineMark(editor, "underline");
	},
};

function isCellEditing(
	editor: Editor,
	fe: FieldEditorInputController,
): boolean {
	if (fe.activeCellCoord != null || editor.selection?.type === "cell") {
		return true;
	}
	const blockId = fe.focusBlockId;
	if (!blockId) {
		return false;
	}
	return editor.getBlock(blockId)?.type === "table";
}

function resolveFieldInsertRange(
	editor: Editor,
	fe: FieldEditorInputController,
	resolvedRange: { start: number; end: number } | null,
): { start: number; end: number } | null {
	if (resolvedRange) {
		return resolvedRange;
	}
	if (isCellEditing(editor, fe)) {
		return null;
	}
	const selection = editor.selection;
	if (
		selection?.type === "text" &&
		selection.focus.blockId === fe.focusBlockId
	) {
		return {
			start: selection.anchor.offset,
			end: selection.focus.offset,
		};
	}
	return null;
}

function tryDispatchMarkToggle(
	editor: Editor,
	fe: FieldEditorInputController,
	mark: string,
): boolean {
	const selection = editor.selection;
	if (!selection || selection.type !== "text" || isCollapsed(selection)) {
		return false;
	}
	return dispatchAndActivate(editor, fe, toggleMark, { mark });
}

function tryDispatchInsert(
	editor: Editor,
	fe: FieldEditorInputController,
	backend: ContentEditableDirectInputBackend,
	blockId: string,
	range: { start: number; end: number },
	text: string,
	marks: Record<string, unknown | null> | undefined,
): boolean {
	if (isCellEditing(editor, fe)) {
		return false;
	}
	syncEditorTextSelection(editor, blockId, range);
	if (
		!dispatchEditorCommand(editor, insertTextCommand, { text, marks })
	) {
		return false;
	}
	backend.commitDispatchedEdit?.();
	return true;
}

function tryDispatchMapped<P>(
	editor: Editor,
	fe: FieldEditorInputController,
	backend: ContentEditableDirectInputBackend,
	command: Command<P>,
	param: P,
	range?: { start: number; end: number } | null,
): boolean {
	if (isCellEditing(editor, fe)) {
		return false;
	}
	const blockId = fe.focusBlockId;
	if (blockId && range) {
		syncEditorTextSelection(editor, blockId, range);
	}
	if (!dispatchAndActivate(editor, fe, command, param)) {
		return false;
	}
	backend.commitDispatchedEdit?.();
	return true;
}

function hasMultiBlockTextSelection(editor: Editor): boolean {
	const selection = editor.selection;
	return selection?.type === "text" && isMultiBlock(selection);
}

function resolveEditorLocale(editor: Editor): string {
	const locale = editor.internals.getSlot<string>("pen.locale");
	if (typeof locale === "string" && locale.length > 0) {
		return locale;
	}
	return "en";
}
