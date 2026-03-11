export const FIELD_EDITOR_SLOT_KEY = "field-editor";
export const COLLECT_KEY_BINDINGS_SLOT_KEY = "core:collect-key-bindings";
export const INPUT_RULES_ENGINE_SLOT_KEY = "input-rules:engine";
export const UNDO_HISTORY_RESTORE_SLOT_KEY = "undo:history-restore";

/**
 * Tag placed on Yjs transaction origins by the undo manager. The rendering
 * layer checks this instead of relying on `constructor.name` (which breaks
 * under minification).
 */
export const HISTORY_ORIGIN_TAG = "__pen_history__";
