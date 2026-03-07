import type { Editor } from "@pen/core";
import { useSyncExternalStoreWithSelector } from "../utils/useSyncExternalStoreWithSelector.js";
import { getExpandedBlockRole } from "../field-editor/crossBlock.js";
import type { FieldEditorStore } from "../field-editor/store.js";

const EMPTY_FIELD_EDITOR_SNAPSHOT = {
	activeBlockIds: [],
	mode: "inactive",
} as const;

export function useBlockSurfaceRole(
	editor: Editor,
	fieldEditor: FieldEditorStore | null,
	blockId: string,
): "editable-inline" | "structural" | "delegated" | null {
	return useSyncExternalStoreWithSelector(
		(callback) => {
			if (!fieldEditor) return () => {};
			return fieldEditor.subscribe(callback);
		},
		() => fieldEditor?.getSnapshot() ?? EMPTY_FIELD_EDITOR_SNAPSHOT,
		() => EMPTY_FIELD_EDITOR_SNAPSHOT,
		(snapshot) => {
			if (snapshot.mode !== "expanded") return null;
			if (!snapshot.activeBlockIds.includes(blockId)) return null;
			return getExpandedBlockRole(editor, blockId);
		},
	);
}
