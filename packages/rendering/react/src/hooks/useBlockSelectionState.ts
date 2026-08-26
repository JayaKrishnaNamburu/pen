import { isBlockSelected } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { useSyncExternalStoreWithSelector } from "../utils/useSyncExternalStoreWithSelector";

export function useBlockSelectionState(
	editor: Editor,
	blockId: string,
): boolean {
	return useSyncExternalStoreWithSelector(
		(callback) => editor.on("selectionChange", callback),
		() => editor.selection,
		() => null,
		(selection) =>
			isBlockSelected(editor.documentState.blockOrder, selection, blockId),
	);
}
