import type {
	CommandResult,
	DocumentOp,
	Editor,
	FacetProvider,
	SelectionState,
	TextSelection,
} from "@input/pen-types";
import { generateId } from "@input/pen-types";

import { isContinuousTextFlowCapability } from "../editor/profilePolicy";
import { isCollapsed } from "../selection/helpers";
import {
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
} from "../editor/textSegmentation";
import { commandHandler, defineCommand } from "./define";
import {
	BACKSPACE_EXIT_TYPES,
	CONTAINER_EXIT_TYPES,
	HEADING_TYPES,
	LIST_BLOCK_TYPES,
	collapsedAt,
	convertBlockOps,
	documentOrderedTextPoints,
	emitCommandDiagnostic,
	getAdjacentEditableBlock,
	getAdjacentVisibleBlockId,
	getBlockInputMode,
	getEditorFlowCapability,
	getEditorLocale,
	getInlineNodeRange,
	getListIndent,
	isEditableTextBlock,
	isInsideParentIdContainer,
	isListBlock,
	logicalInline,
	marksAtOffset,
	readTextFocus,
	replaceRangeOps,
	textSelectionResult,
	usesInlineMarks,
	type Point,
} from "./helpers";

export type DeleteGranularity = "grapheme" | "word" | "line";

export interface InsertTextParam {
	readonly text: string;
	readonly marks?: Record<string, unknown | null>;
}

export interface DeleteParam {
	readonly granularity: DeleteGranularity;
}

export interface ToggleMarkParam {
	readonly mark: string;
	readonly value?: unknown;
}

export interface ConvertBlockParam {
	readonly blockId: string;
	readonly newType: string;
	readonly newProps?: Record<string, unknown>;
}

export const insertText = defineCommand<InsertTextParam>("pen.insertText");
export const deleteBackward = defineCommand<DeleteParam>("pen.deleteBackward");
export const deleteForward = defineCommand<DeleteParam>("pen.deleteForward");
export const insertLineBreak = defineCommand("pen.insertLineBreak");
export const splitBlock = defineCommand("pen.splitBlock");
export const indent = defineCommand("pen.indent");
export const outdent = defineCommand("pen.outdent");
export const toggleMark = defineCommand<ToggleMarkParam>("pen.toggleMark");
export const convertBlock = defineCommand<ConvertBlockParam>("pen.convertBlock");

/**
 * Field-editor / v1 `applyDeleteBehavior`: adjacent inline atom → SELECT it.
 * Does not mutate the document. The next delete (non-collapsed range) removes it.
 * This is the intended product, not the live keystroke (see handleDelete).
 */
export function selectAdjacentInlineAtom(
	editor: Editor,
	direction: "backward" | "forward",
): SelectionState | null {
	const atom = adjacentInlineAtomRange(editor, direction);
	if (!atom) {
		return null;
	}
	return textSelectionResult(
		{ blockId: atom.blockId, offset: atom.start },
		{ blockId: atom.blockId, offset: atom.end },
	);
}

/**
 * Current registry one-shot: adjacent inline atom → DELETE it.
 * Same detection as `selectAdjacentInlineAtom`; different product.
 * This is the live keystroke (`createEditor` registry + keymap).
 */
export function deleteAdjacentInlineAtom(
	editor: Editor,
	direction: "backward" | "forward",
): { ops: DocumentOp[]; caret: Point } | null {
	const atom = adjacentInlineAtomRange(editor, direction);
	if (!atom) {
		return null;
	}
	return {
		ops: [
			{
				type: "delete-text",
				blockId: atom.blockId,
				offset: atom.start,
				length: atom.end - atom.start,
			},
		],
		caret: { blockId: atom.blockId, offset: atom.start },
	};
}

function adjacentInlineAtomRange(
	editor: Editor,
	direction: "backward" | "forward",
): { blockId: string; start: number; end: number } | null {
	const focus = readTextFocus(editor);
	if (!focus) {
		return null;
	}
	const range = getInlineNodeRange(editor, {
		blockId: focus.blockId,
		offset: focus.offset,
		direction,
	});
	if (!range) {
		return null;
	}
	return { blockId: focus.blockId, start: range.start, end: range.end };
}

export function textCommandHandlers(): FacetProvider[] {
	return [
		commandHandler(insertText, handleInsertText),
		commandHandler(deleteBackward, (editor, param) =>
			handleDelete(editor, "backward", param),
		),
		commandHandler(deleteForward, (editor, param) =>
			handleDelete(editor, "forward", param),
		),
		commandHandler(insertLineBreak, handleInsertLineBreak),
		commandHandler(splitBlock, handleSplitBlock),
		commandHandler(indent, (editor) => handleListIndent(editor, false)),
		commandHandler(outdent, (editor) => handleListIndent(editor, true)),
		commandHandler(toggleMark, handleToggleMark),
		commandHandler(convertBlock, handleConvertBlock),
	];
}

function handleInsertText(
	editor: Editor,
	param: InsertTextParam,
): CommandResult | false {
	const selection = editor.selection;
	if (!selection || selection.type !== "text") {
		return false;
	}
	const block = editor.getBlock(selection.focus.blockId);
	const marks =
		param.marks !== undefined
			? param.marks
			: block
				? marksAtOffset(block, selection.focus.offset)
				: undefined;
	const replacement = replaceRangeOps(editor, selection, param.text, marks);
	if (!replacement) {
		return false;
	}
	if (replacement.ops.length === 0) {
		return { selection: collapsedAt(replacement.caret.blockId, replacement.caret.offset) };
	}
	editor.apply(replacement.ops, { origin: "user" });
	return {
		selection: collapsedAt(replacement.caret.blockId, replacement.caret.offset),
	};
}

function handleInsertLineBreak(editor: Editor): CommandResult | false {
	return handleInsertText(editor, { text: "\n" });
}

function handleDelete(
	editor: Editor,
	direction: "backward" | "forward",
	param: DeleteParam,
): CommandResult | false {
	const selection = editor.selection;
	if (!selection) {
		return false;
	}

	if (selection.type === "block") {
		return deleteSelectedBlocks(editor, selection.blockIds);
	}
	if (selection.type !== "text") {
		return false;
	}

	if (!isCollapsed(selection)) {
		const replacement = replaceRangeOps(editor, selection, "");
		if (!replacement) {
			return false;
		}
		if (replacement.ops.length > 0) {
			editor.apply(replacement.ops, { origin: "user" });
		}
		return {
			selection: collapsedAt(
				replacement.caret.blockId,
				replacement.caret.offset,
			),
		};
	}

	return deleteCollapsed(editor, selection, direction, param.granularity);
}

function deleteCollapsed(
	editor: Editor,
	selection: TextSelection,
	direction: "backward" | "forward",
	granularity: DeleteGranularity,
): CommandResult | false {
	const blockId = selection.focus.blockId;
	const block = editor.getBlock(blockId);
	if (!block) {
		return false;
	}

	const oneShot = deleteAdjacentInlineAtom(editor, direction);
	if (oneShot) {
		editor.apply(oneShot.ops, { origin: "user" });
		return {
			selection: collapsedAt(oneShot.caret.blockId, oneShot.caret.offset),
		};
	}

	const { text } = logicalInline(block);
	const offset = selection.focus.offset;
	const atBoundary =
		direction === "backward" ? offset === 0 : offset === text.length;
	if (atBoundary) {
		return deleteAtBlockBoundary(editor, blockId, direction);
	}

	const locale = getEditorLocale(editor);
	const range = deleteRangeForGranularity(
		text,
		offset,
		direction,
		granularity,
		locale,
	);
	if (!range || range.end <= range.start) {
		return false;
	}

	editor.apply(
		[
			{
				type: "delete-text",
				blockId,
				offset: range.start,
				length: range.end - range.start,
			},
		],
		{ origin: "user" },
	);
	return { selection: collapsedAt(blockId, range.start) };
}

function deleteRangeForGranularity(
	text: string,
	offset: number,
	direction: "backward" | "forward",
	granularity: DeleteGranularity,
	locale: string,
): { start: number; end: number } | null {
	switch (granularity) {
		case "grapheme": {
			const next =
				direction === "backward"
					? previousGraphemeBoundary(text, offset, locale)
					: nextGraphemeBoundary(text, offset, locale);
			return direction === "backward"
				? { start: next, end: offset }
				: { start: offset, end: next };
		}
		case "word": {
			const next =
				direction === "backward"
					? previousWordBoundary(text, offset, locale)
					: nextWordBoundary(text, offset, locale);
			return direction === "backward"
				? { start: next, end: offset }
				: { start: offset, end: next };
		}
		case "line":
			return direction === "backward"
				? { start: 0, end: offset }
				: { start: offset, end: text.length };
		default: {
			const _exhaustive: never = granularity;
			return _exhaustive;
		}
	}
}

function deleteAtBlockBoundary(
	editor: Editor,
	blockId: string,
	direction: "backward" | "forward",
): CommandResult | false {
	if (direction === "forward") {
		return mergeForwardAtBlockEnd(editor, blockId);
	}
	return applyBackspaceAtBlockStart(editor, blockId);
}

function applyBackspaceAtBlockStart(
	editor: Editor,
	blockId: string,
): CommandResult | false {
	if (
		!isContinuousTextFlowCapability(getEditorFlowCapability(editor, blockId))
	) {
		return false;
	}

	const block = editor.getBlock(blockId);
	if (!block) {
		return false;
	}

	const empty = block.length() === 0;

	if (empty && block.type === "toggle" && block.children.length === 0) {
		const previousBlock = getAdjacentEditableBlock(
			editor,
			blockId,
			"previous",
		);
		if (previousBlock) {
			return applyDeleteBlockAndCaret(editor, blockId, previousBlock.id);
		}
		return applyConvert(editor, { blockId, newType: "paragraph" });
	}

	if (empty && BACKSPACE_EXIT_TYPES.has(block.type)) {
		return applyConvert(editor, { blockId, newType: "paragraph" });
	}

	const immediateBlockId = getAdjacentVisibleBlockId(
		editor,
		blockId,
		"previous",
	);
	if (
		immediateBlockId &&
		!isContinuousTextFlowCapability(
			getEditorFlowCapability(editor, immediateBlockId),
		)
	) {
		return { selection: { type: "block", blockIds: [immediateBlockId] } };
	}

	const previousBlock = getAdjacentEditableBlock(editor, blockId, "previous");
	if (!previousBlock) {
		return false;
	}

	const targetOffset = previousBlock.length();
	if (empty) {
		editor.apply([{ type: "delete-block", blockId }], { origin: "user" });
	} else {
		editor.apply(
			[
				{
					type: "merge-blocks",
					targetBlockId: previousBlock.id,
					sourceBlockId: blockId,
				},
			],
			{ origin: "user" },
		);
	}
	return { selection: collapsedAt(previousBlock.id, targetOffset) };
}

function mergeForwardAtBlockEnd(
	editor: Editor,
	blockId: string,
): CommandResult | false {
	if (
		!isContinuousTextFlowCapability(getEditorFlowCapability(editor, blockId))
	) {
		return false;
	}

	const immediateBlockId = getAdjacentVisibleBlockId(editor, blockId, "next");
	if (
		immediateBlockId &&
		!isContinuousTextFlowCapability(
			getEditorFlowCapability(editor, immediateBlockId),
		)
	) {
		return { selection: { type: "block", blockIds: [immediateBlockId] } };
	}

	const nextBlock = getAdjacentEditableBlock(editor, blockId, "next");
	if (!nextBlock) {
		return false;
	}

	const current = editor.getBlock(blockId);
	if (!current) {
		return false;
	}
	const caret = current.length();
	if (nextBlock.length() === 0) {
		editor.apply([{ type: "delete-block", blockId: nextBlock.id }], {
			origin: "user",
		});
	} else {
		editor.apply(
			[
				{
					type: "merge-blocks",
					targetBlockId: blockId,
					sourceBlockId: nextBlock.id,
				},
			],
			{ origin: "user" },
		);
	}
	return { selection: collapsedAt(blockId, caret) };
}

function applyDeleteBlockAndCaret(
	editor: Editor,
	blockId: string,
	caretBlockId: string,
): CommandResult | false {
	const caretBlock = editor.getBlock(caretBlockId);
	if (!caretBlock) {
		return false;
	}
	const offset = caretBlock.length();
	editor.apply([{ type: "delete-block", blockId }], { origin: "user" });
	return { selection: collapsedAt(caretBlockId, offset) };
}

function deleteSelectedBlocks(
	editor: Editor,
	blockIds: readonly string[],
): CommandResult | false {
	if (blockIds.length === 0) {
		return false;
	}
	const firstId = blockIds[0]!;
	const previousId = getAdjacentVisibleBlockId(editor, firstId, "previous");
	const nextId = getAdjacentVisibleBlockId(
		editor,
		blockIds[blockIds.length - 1]!,
		"next",
	);
	editor.apply(
		blockIds.map((blockId) => ({ type: "delete-block" as const, blockId })),
		{ origin: "user" },
	);
	const fallbackId = previousId ?? nextId;
	if (!fallbackId || !editor.getBlock(fallbackId)) {
		return true;
	}
	if (isEditableTextBlock(editor, fallbackId)) {
		const fallback = editor.getBlock(fallbackId);
		return {
			selection: collapsedAt(fallbackId, fallback?.length() ?? 0),
		};
	}
	return { selection: { type: "block", blockIds: [fallbackId] } };
}

function handleSplitBlock(editor: Editor): CommandResult | false {
	const focus = readTextFocus(editor);
	if (!focus) {
		return false;
	}

	const inputMode = getBlockInputMode(editor, focus.blockId);
	const action = resolveEnterAction(editor, focus.blockId, inputMode);
	if (!action) {
		return false;
	}

	switch (action.action) {
		case "insert-text":
			return handleInsertText(editor, { text: action.text });
		case "convert":
			return applyConvert(editor, {
				blockId: focus.blockId,
				newType: action.newType,
			});
		case "lift":
			editor.apply(
				[
					{
						type: "update-block",
						blockId: focus.blockId,
						props: { parentId: null },
					},
				],
				{ origin: "user" },
			);
			return { selection: collapsedAt(focus.blockId, 0) };
		case "split": {
			const newBlockId = generateId();
			editor.apply(
				[
					{
						type: "split-block",
						blockId: focus.blockId,
						offset: focus.offset,
						newBlockId,
						newBlockType: action.newBlockType,
					},
				],
				{ origin: "user" },
			);
			return { selection: collapsedAt(newBlockId, 0) };
		}
		default: {
			const _exhaustive: never = action;
			return _exhaustive;
		}
	}
}

type EnterAction =
	| { action: "split"; newBlockType: string | undefined }
	| { action: "convert"; newType: string }
	| { action: "lift" }
	| { action: "insert-text"; text: string };

function resolveEnterAction(
	editor: Editor,
	blockId: string,
	inputMode: "richtext" | "code" | "table" | "none",
): EnterAction | null {
	if (inputMode === "code") {
		return { action: "insert-text", text: "\n" };
	}
	if (inputMode !== "richtext") {
		return null;
	}

	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}

	const empty = block.length() === 0;
	if (empty && LIST_BLOCK_TYPES.has(block.type)) {
		return { action: "convert", newType: "paragraph" };
	}
	if (empty && CONTAINER_EXIT_TYPES.has(block.type)) {
		return { action: "convert", newType: "paragraph" };
	}
	if (empty && isInsideParentIdContainer(editor, blockId)) {
		return { action: "lift" };
	}
	if (HEADING_TYPES.has(block.type)) {
		return { action: "split", newBlockType: "paragraph" };
	}
	return { action: "split", newBlockType: undefined };
}

function handleListIndent(
	editor: Editor,
	shiftKey: boolean,
): CommandResult | false {
	const focus = readTextFocus(editor);
	if (!focus) {
		return false;
	}
	const block = editor.getBlock(focus.blockId);
	if (!isListBlock(block)) {
		return false;
	}

	const currentIndent = getListIndent(block);
	let nextIndent = currentIndent;
	if (shiftKey) {
		nextIndent = Math.max(0, currentIndent - 1);
	} else {
		const previousBlockId = getAdjacentVisibleBlockId(
			editor,
			focus.blockId,
			"previous",
		);
		const previousBlock = previousBlockId
			? editor.getBlock(previousBlockId)
			: null;
		const sharesParent =
			previousBlockId !== null &&
			editor.documentState.parentOf(previousBlockId) ===
				editor.documentState.parentOf(focus.blockId);
		if (
			isListBlock(previousBlock) &&
			sharesParent &&
			getListIndent(previousBlock) >= currentIndent
		) {
			nextIndent = currentIndent + 1;
		}
	}

	if (nextIndent === currentIndent) {
		return false;
	}

	editor.apply(
		[
			{
				type: "update-block",
				blockId: focus.blockId,
				props: { indent: nextIndent },
			},
		],
		{ origin: "user" },
	);
	return {
		selection: collapsedAt(focus.blockId, focus.offset),
	};
}

function handleToggleMark(
	editor: Editor,
	param: ToggleMarkParam,
): CommandResult | false {
	const selection = editor.selection;
	if (!selection || selection.type !== "text") {
		return false;
	}
	if (!editor.schema.resolveInline(param.mark)) {
		return false;
	}
	if (isCollapsed(selection)) {
		return false;
	}

	const range = documentOrderedTextPoints(editor, selection);
	if (!range || range.start.blockId !== range.end.blockId) {
		return toggleMarkAcrossBlocks(editor, selection, param);
	}
	if (!usesInlineMarks(editor, range.start.blockId)) {
		return false;
	}

	const hasMark = hasMarkInRange(
		editor,
		range.start.blockId,
		range.start.offset,
		range.end.offset,
		param.mark,
	);
	const nextValue = param.value === undefined ? (hasMark ? null : true) : param.value;
	editor.apply(
		[
			{
				type: "format-text",
				blockId: range.start.blockId,
				offset: range.start.offset,
				length: range.end.offset - range.start.offset,
				marks: { [param.mark]: nextValue },
			},
		],
		{ origin: "user" },
	);
	return true;
}

function toggleMarkAcrossBlocks(
	editor: Editor,
	selection: TextSelection,
	param: ToggleMarkParam,
): CommandResult | false {
	const range = documentOrderedTextPoints(editor, selection);
	if (!range) {
		return false;
	}
	const order = editor.documentState.blockOrder;
	const startIndex = order.indexOf(range.start.blockId);
	const endIndex = order.indexOf(range.end.blockId);
	if (startIndex < 0 || endIndex < 0) {
		return false;
	}

	const segments: Array<{ blockId: string; start: number; end: number }> = [];
	for (let index = startIndex; index <= endIndex; index += 1) {
		const blockId = order[index];
		if (!blockId || !usesInlineMarks(editor, blockId)) {
			continue;
		}
		const block = editor.getBlock(blockId);
		if (!block) {
			continue;
		}
		const start = index === startIndex ? range.start.offset : 0;
		const end = index === endIndex ? range.end.offset : block.length();
		if (end > start) {
			segments.push({ blockId, start, end });
		}
	}
	if (segments.length === 0) {
		return false;
	}

	const hasMark = segments.every((segment) =>
		hasMarkInRange(
			editor,
			segment.blockId,
			segment.start,
			segment.end,
			param.mark,
		),
	);
	const nextValue = param.value === undefined ? (hasMark ? null : true) : param.value;
	editor.apply(
		segments.map((segment) => ({
			type: "format-text" as const,
			blockId: segment.blockId,
			offset: segment.start,
			length: segment.end - segment.start,
			marks: { [param.mark]: nextValue },
		})),
		{ origin: "user" },
	);
	return true;
}

function hasMarkInRange(
	editor: Editor,
	blockId: string,
	start: number,
	end: number,
	mark: string,
): boolean {
	const block = editor.getBlock(blockId);
	if (!block) {
		return false;
	}
	let offset = 0;
	let covered = false;
	for (const delta of block.textDeltas()) {
		const length = delta.insert.length;
		const segStart = offset;
		const segEnd = offset + length;
		offset = segEnd;
		if (segEnd <= start || segStart >= end) {
			continue;
		}
		covered = true;
		if (!delta.attributes?.[mark]) {
			return false;
		}
	}
	return covered;
}

function handleConvertBlock(
	editor: Editor,
	param: ConvertBlockParam,
): CommandResult | false {
	return applyConvert(editor, param);
}

function applyConvert(
	editor: Editor,
	param: ConvertBlockParam,
): CommandResult | false {
	if (!editor.getBlock(param.blockId)) {
		return false;
	}
	if (
		!editor.schema.allBlocks().some((schema) => schema.type === param.newType)
	) {
		emitCommandDiagnostic(editor, {
			code: "invalid-block-type",
			level: "warn",
			source: "commands",
			message: `cannot convert to unknown block type ${param.newType}`,
			blockId: param.blockId,
			newType: param.newType,
		});
		return false;
	}
	editor.apply(convertBlockOps(editor, param), { origin: "user" });
	return { selection: collapsedAt(param.blockId, 0) };
}
