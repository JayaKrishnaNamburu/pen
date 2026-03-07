import { useRef, useSyncExternalStore } from "react";
import type { FieldEditor, SelectionState } from "@pen/core";

interface FieldEditorStateSnapshot {
  activeBlockId: string | null;
  activeBlockIds: readonly string[];
  isEditing: boolean;
  inputMode: "richtext" | "code" | "table" | "none";
  selection: SelectionState | null;
}

const EMPTY_FIELD_EDITOR_STATE: FieldEditorStateSnapshot = {
  activeBlockId: null,
  activeBlockIds: [],
  isEditing: false,
  inputMode: "none",
  selection: null,
};

export function useFieldEditorState(
  fieldEditor: FieldEditor | null,
): FieldEditorStateSnapshot {
  const snapshotRef = useRef<FieldEditorStateSnapshot>(EMPTY_FIELD_EDITOR_STATE);

  return useSyncExternalStore(
    (callback) => {
      if (!fieldEditor) return () => {};

      const unsubscribeActivate = fieldEditor.onActivate?.(() => callback());
      const unsubscribeDeactivate = fieldEditor.onDeactivate?.(() => callback());
      const unsubscribeSelection = fieldEditor.onSelectionChange?.(() => callback());

      return () => {
        unsubscribeActivate?.();
        unsubscribeDeactivate?.();
        unsubscribeSelection?.();
      };
    },
    () => {
      if (!fieldEditor) {
        snapshotRef.current = EMPTY_FIELD_EDITOR_STATE;
        return EMPTY_FIELD_EDITOR_STATE;
      }

      const nextSnapshot: FieldEditorStateSnapshot = {
        activeBlockId: fieldEditor.activeBlockId,
        activeBlockIds: fieldEditor.activeBlockIds,
        isEditing: fieldEditor.isEditing,
        inputMode: fieldEditor.inputMode,
        selection: fieldEditor.selection,
      };

      const prevSnapshot = snapshotRef.current;
      if (
        prevSnapshot.activeBlockId === nextSnapshot.activeBlockId &&
        prevSnapshot.activeBlockIds === nextSnapshot.activeBlockIds &&
        prevSnapshot.isEditing === nextSnapshot.isEditing &&
        prevSnapshot.inputMode === nextSnapshot.inputMode &&
        prevSnapshot.selection === nextSnapshot.selection
      ) {
        return prevSnapshot;
      }

      snapshotRef.current = nextSnapshot;
      return nextSnapshot;
    },
    () => EMPTY_FIELD_EDITOR_STATE,
  );
}
