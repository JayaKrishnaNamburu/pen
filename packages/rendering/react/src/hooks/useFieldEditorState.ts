import { useRef, useSyncExternalStore } from "react";
import type {
	FieldEditorStore,
	FieldEditorStoreSnapshot,
} from "../field-editor/store.js";

const EMPTY_FIELD_EDITOR_STATE: FieldEditorStoreSnapshot = {
	focusBlockId: null,
	activeBlockIds: [],
	isEditing: false,
	isFocused: false,
	isComposing: false,
	inputMode: "none",
	mode: "inactive",
};

export function useFieldEditorState(
	fieldEditor: FieldEditorStore | null,
): FieldEditorStoreSnapshot {
	const snapshotRef = useRef<FieldEditorStoreSnapshot>(EMPTY_FIELD_EDITOR_STATE);

	return useSyncExternalStore(
		(callback) => {
			if (!fieldEditor) return () => {};
			return fieldEditor.subscribe(callback);
		},
		() => {
			if (!fieldEditor) {
				snapshotRef.current = EMPTY_FIELD_EDITOR_STATE;
				return EMPTY_FIELD_EDITOR_STATE;
			}

			const nextSnapshot = fieldEditor.getSnapshot();

			const prevSnapshot = snapshotRef.current;
			if (
				prevSnapshot.focusBlockId === nextSnapshot.focusBlockId &&
				prevSnapshot.activeBlockIds === nextSnapshot.activeBlockIds &&
				prevSnapshot.isEditing === nextSnapshot.isEditing &&
				prevSnapshot.isFocused === nextSnapshot.isFocused &&
				prevSnapshot.isComposing === nextSnapshot.isComposing &&
				prevSnapshot.inputMode === nextSnapshot.inputMode &&
				prevSnapshot.mode === nextSnapshot.mode
			) {
				return prevSnapshot;
			}

			snapshotRef.current = nextSnapshot;
			return nextSnapshot;
		},
		() => EMPTY_FIELD_EDITOR_STATE,
	);
}
