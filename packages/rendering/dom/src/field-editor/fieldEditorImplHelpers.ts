import type { BlockSchema, Editor } from "@pen/types";
import { usesInlineTextSelection, resolveFieldEditorInputMode } from "@pen/types";
import { getEditorBlockSelectionLength } from "../utils/blockSelectionSemantics";

export function resolveInputMode(
	schema?: BlockSchema | null,
): "richtext" | "code" | "table" | "none" {
	return resolveFieldEditorInputMode(schema);
}

export function isDomSelectionCoveringElementContents(element: HTMLElement): boolean {
	const selection = element.ownerDocument?.getSelection();
	if (!selection || selection.rangeCount === 0) {
		return false;
	}

	const range = selection.getRangeAt(0);
	if (
		!element.contains(range.startContainer) ||
		!element.contains(range.endContainer)
	) {
		return false;
	}

	const fullRange = element.ownerDocument.createRange();
	fullRange.selectNodeContents(element);
	return (
		range.compareBoundaryPoints(Range.START_TO_START, fullRange) === 0 &&
		range.compareBoundaryPoints(Range.END_TO_END, fullRange) === 0
	);
}

export function areBlockIdsEqual(
	left: readonly string[],
	right: readonly string[],
): boolean {
	if (left.length !== right.length) return false;
	for (let i = 0; i < left.length; i++) {
		if (left[i] !== right[i]) return false;
	}
	return true;
}

export function getFullDocumentTextRange(editor: Editor): {
	start: { blockId: string; offset: number };
	end: { blockId: string; offset: number };
	focusBlockId: string;
} | null {
	const blockOrder = editor.documentState.blockOrder;
	const firstBlockId = blockOrder[0];
	const lastBlockId = blockOrder[blockOrder.length - 1];
	if (!firstBlockId || !lastBlockId) {
		return null;
	}

	const focusBlockId =
		blockOrder.find((blockId) => {
			const block = editor.getBlock(blockId);
			if (!block) return false;
			const schema = editor.schema.resolve(block.type);
			return usesInlineTextSelection(schema);
		}) ?? firstBlockId;

	return {
		start: { blockId: firstBlockId, offset: 0 },
		end: {
			blockId: lastBlockId,
			offset: getEditorBlockSelectionLength(editor, lastBlockId),
		},
		focusBlockId,
	};
}

export function pointsEqual(
	left: { blockId: string; offset: number },
	right: { blockId: string; offset: number },
): boolean {
	return left.blockId === right.blockId && left.offset === right.offset;
}
