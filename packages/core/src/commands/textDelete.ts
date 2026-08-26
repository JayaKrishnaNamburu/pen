import type {
	CommandResult,
	DocumentOp,
	Editor,
	Point,
	SelectionState,
	TextSelection,
} from "@input/pen-types";

import { isContinuousTextFlowCapability } from "../editor/profilePolicy";
import { isCollapsed } from "../selection/helpers";
import {
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
} from "../editor/textSegmentation";
import { buildMergeBlocksRecipe, spliceDeleteOp } from "../ops/recipes";
import {
	BACKSPACE_EXIT_TYPES,
	collapsedAt,
	getAdjacentEditableBlock,
	getAdjacentVisibleBlockId,
	getEditorFlowCapability,
	getEditorLocale,
	getInlineNodeRange,
	isEditableTextBlock,
	logicalInline,
	readTextFocus,
	replaceRangeOps,
	textSelectionResult,
} from "./helpers";
import { applyConvert } from "./textConvert";
import type { DeleteGranularity } from "./textParams";

/**
 * Adjacent inline atom → SELECT it. Does not mutate the document.
 * The next delete (non-collapsed `handleDelete`) removes it through the
 * ordinary selection-delete path.
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
 * One-shot helper: adjacent inline atom → DELETE it.
 * Same detection as `selectAdjacentInlineAtom`. The live registry no
 * longer calls this; first-press Backspace / Delete selects instead.
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
		ops: [spliceDeleteOp(atom.blockId, atom.start, atom.end - atom.start)],
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

export function handleDelete(
	editor: Editor,
	direction: "backward" | "forward",
	granularity: DeleteGranularity,
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
			editor.apply(replacement.ops, {
				origin: "user",
				structural: replacement.structural,
			});
		}
		return {
			selection: collapsedAt(
				replacement.caret.blockId,
				replacement.caret.offset,
			),
		};
	}

	return deleteCollapsed(editor, selection, direction, granularity);
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

	const selectedAtom = selectAdjacentInlineAtom(editor, direction);
	if (selectedAtom) {
		return { selection: selectedAtom };
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
		[spliceDeleteOp(blockId, range.start, range.end - range.start)],
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
		!isContinuousTextFlowCapability(
			getEditorFlowCapability(editor, blockId),
		)
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
		const source = editor.getBlock(blockId);
		if (!source) {
			return false;
		}
		const merge = buildMergeBlocksRecipe({
			target: previousBlock,
			source,
		});
		editor.apply(merge.ops, {
			origin: "user",
			structural: merge.structural,
		});
	}
	return { selection: collapsedAt(previousBlock.id, targetOffset) };
}

function mergeForwardAtBlockEnd(
	editor: Editor,
	blockId: string,
): CommandResult | false {
	if (
		!isContinuousTextFlowCapability(
			getEditorFlowCapability(editor, blockId),
		)
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
		const target = editor.getBlock(blockId);
		if (!target) {
			return false;
		}
		const merge = buildMergeBlocksRecipe({
			target,
			source: nextBlock,
		});
		editor.apply(merge.ops, {
			origin: "user",
			structural: merge.structural,
		});
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
