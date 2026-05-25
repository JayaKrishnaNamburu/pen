import type { DocumentOp, Editor } from "@pen/types";
import { getAdjacentVisibleBlockId } from "../utils/parentIdTree";
import {
	getEditorFlowCapability,
	isContinuousTextFlowCapability,
} from "../utils/flowCapabilities";
import {
	getListIndent,
	getLogicalInlineLength,
	getSelectionTarget,
	isCollapsedRange,
	isListBlock,
	normalizeInlineRange,
	type InlineTextLike,
	type SelectionRange,
	type SelectionTarget,
} from "./commandsShared";

export function moveCaretAcrossBlocks(
	editor: Editor,
	options: {
		blockId: string;
		ytext: InlineTextLike;
		range: SelectionRange | null;
		direction: "previous" | "next";
	},
): SelectionTarget | null {
	const { blockId, ytext, direction } = options;
	const range = normalizeInlineRange(ytext, options.range);
	if (!isCollapsedRange(range)) return null;

	const currentOffset = range?.start ?? 0;
	const logicalLength = getLogicalInlineLength(ytext);
	const isAtBoundary =
		direction === "previous"
			? currentOffset === 0
			: currentOffset === logicalLength;
	if (!isAtBoundary) return null;

	const immediateId = getAdjacentVisibleBlockId(editor, blockId, direction);
	if (!immediateId) return null;

	if (
		!isContinuousTextFlowCapability(
			getEditorFlowCapability(editor, immediateId),
		)
	) {
		return {
			blockId: immediateId,
			anchorOffset: 0,
			focusOffset: 0,
			selectBlock: true,
		};
	}

	const adjacentBlock = editor.getBlock(immediateId);
	if (!adjacentBlock) return null;

	const targetOffset = direction === "previous" ? adjacentBlock.length() : 0;
	return {
		blockId: adjacentBlock.id,
		anchorOffset: targetOffset,
		focusOffset: targetOffset,
	};
}

export function applyListTabBehavior(
	editor: Editor,
	options: {
		blockId: string;
		ytext: InlineTextLike;
		range: SelectionRange | null;
		shiftKey: boolean;
	},
): SelectionTarget | null {
	const { blockId, ytext, range, shiftKey } = options;
	const block = editor.getBlock(blockId);
	if (!isListBlock(block)) {
		return null;
	}

	const currentIndent = getListIndent(block);
	let nextIndent = currentIndent;

	if (shiftKey) {
		nextIndent = Math.max(0, currentIndent - 1);
	} else {
		const previousBlockId = getAdjacentVisibleBlockId(
			editor,
			blockId,
			"previous",
		);
		const previousBlock = previousBlockId
			? editor.getBlock(previousBlockId)
			: null;
		const sharesParent =
			previousBlockId !== null &&
			editor.documentState.parentOf(previousBlockId) ===
				editor.documentState.parentOf(blockId);

		if (
			isListBlock(previousBlock) &&
			sharesParent &&
			getListIndent(previousBlock) >= currentIndent
		) {
			nextIndent = currentIndent + 1;
		}
	}

	if (nextIndent === currentIndent) {
		return null;
	}

	editor.apply(
		[
			{
				type: "update-block",
				blockId,
				props: { indent: nextIndent },
			} as DocumentOp,
		],
		{ origin: "user" },
	);

	return getSelectionTarget(blockId, ytext, range);
}
