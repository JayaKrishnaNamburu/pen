import type { FieldEditorStore } from "../field-editor/store.js";
import { useSyncExternalStoreWithSelector } from "../utils/useSyncExternalStoreWithSelector.js";

const EMPTY_FIELD_EDITOR_SNAPSHOT = {
	focusBlockId: null,
};

export function useBlockEditingState(
	fieldEditor: FieldEditorStore | null,
	blockId: string,
): boolean {
	return useSyncExternalStoreWithSelector(
		(callback) => {
			if (!fieldEditor) return () => {};
			return fieldEditor.subscribe(callback);
		},
		() => fieldEditor?.getSnapshot() ?? EMPTY_FIELD_EDITOR_SNAPSHOT,
		() => EMPTY_FIELD_EDITOR_SNAPSHOT,
		(snapshot) => snapshot.focusBlockId === blockId,
	);
}
