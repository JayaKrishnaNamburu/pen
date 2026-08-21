import { getSelectionBlockRange } from "@input/pen-core";
import type { Editor, SelectionState } from "@input/pen-types";
import { useSyncExternalStoreWithSelector } from "../utils/useSyncExternalStoreWithSelector";

export function useBlockSelectionState(
	editor: Editor,
	blockId: string,
): boolean {
	return useSyncExternalStoreWithSelector(
		(callback) => editor.on("selectionChange", callback),
		() => editor.selection,
		() => null,
		(selection) => isBlockSelected(editor, selection, blockId),
	);
}

function isBlockSelected(
	editor: Editor,
	selection: SelectionState,
	blockId: string,
): boolean {
	return (
		(selection?.type === "block" && selection.blockIds.includes(blockId)) ||
		(selection?.type === "text" &&
			getSelectionBlockRange(editor.internals.doc, selection).includes(
				blockId,
			))
	);
}
