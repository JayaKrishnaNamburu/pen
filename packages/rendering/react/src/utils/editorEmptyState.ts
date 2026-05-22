import type { Editor } from "@pen/types";

interface InlineDeltaLike {
	insert: string | object;
}

const ZERO_WIDTH_SPACE = "\u200B";

export function computeDocumentEmpty(editor: Editor): boolean {
	return editor.documentState.isEmpty;
}

export function computeDocumentPlaceholderVisible(editor: Editor): boolean {
	const { blockOrder } = editor.documentState;
	if (blockOrder.length === 0) return true;
	if (blockOrder.length > 1) return false;
	const block = editor.getBlock(blockOrder[0]);
	if (!block) return true;
	const schema = editor.schema.resolve(block.type);
	if (!schema || schema.content !== "inline" || schema.fieldEditor === "none") {
		return false;
	}
	return isInlineContentEmpty(block.inlineDeltas());
}

export function isInlineContentEmpty(
	deltas: readonly InlineDeltaLike[],
): boolean {
	return deltas.every((delta) => {
		if (typeof delta.insert !== "string") {
			return false;
		}
		return delta.insert.replaceAll(ZERO_WIDTH_SPACE, "").length === 0;
	});
}
