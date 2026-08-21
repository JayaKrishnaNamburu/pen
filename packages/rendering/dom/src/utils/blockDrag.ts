import type { SelectionState } from "@input/pen-types";

export function resolveDragBlockIds(args: {
	blockId: string;
	selection: SelectionState;
	documentBlockCount: number;
	focusBlockId: string | null;
}): readonly string[] {
	const { blockId, selection, documentBlockCount, focusBlockId } = args;
	const isDocumentBlockSelection =
		selection?.type === "block" &&
		selection.blockIds.length === documentBlockCount;
	const shouldDragSelectedBlockSet =
		selection?.type === "block" &&
		selection.blockIds.includes(blockId) &&
		(!isDocumentBlockSelection || focusBlockId === blockId);

	return shouldDragSelectedBlockSet ? selection.blockIds : [blockId];
}
