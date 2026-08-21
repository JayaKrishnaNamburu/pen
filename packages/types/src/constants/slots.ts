/**
 * Extension-slot keys shared across core, renderers, and extensions.
 *
 * These are the contract `editor.internals.assignSlot` / `getSlot` and
 * `SLOT_DISPOSITION_BY_KEY` speak. They are not host-app API — a host
 * using `createEditor` never names them — but they are the extension
 * author surface, and several packages re-export the key they own
 * (`SEARCH_CONTROLLER_SLOT`, `MULTIPLAYER_CONTROLLER_SLOT`,
 * `HISTORY_CONTROLLER_SLOT`, `AUTOCOMPLETE_CONTROLLER_SLOT`).
 *
 * Marking them with the internal JSDoc tag would remove them from the
 * published `.d.ts` (`stripInternal`) while every in-repo consumer
 * still imports them from the root barrel. `package.json` exports only
 * `.` (no internal subpath), so hiding them in this package alone
 * breaks typecheck. Keep them public until Wave P lands an internal
 * entry or the consumers move onto facets.
 */

export const FIELD_EDITOR_SLOT_KEY = "field-editor";
export const COLLECT_KEY_BINDINGS_SLOT_KEY = "core:collect-key-bindings";
export const AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY =
	"core:await-extension-lifecycle";
export const INPUT_RULES_ENGINE_SLOT_KEY = "input-rules:engine";
export const UNDO_HISTORY_RESTORE_SLOT_KEY = "undo:history-restore";
export const UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY =
	"undo:history-metadata-controller";
export const INLINE_COMPLETION_SLOT = "ai:inline-completion";
export const AI_CONTROLLER_SLOT = "ai:controller";
/** Alias of `INLINE_COMPLETION_SLOT`. Prefer the unsuffixed name. */
export const AI_INLINE_COMPLETION_SLOT = INLINE_COMPLETION_SLOT;
export const AI_INLINE_HISTORY_SLOT = "ai:inline-history";
export const AI_REVIEW_CONTROLLER_SLOT = "ai:review";
export const AI_AUTOCOMPLETE_CONTROLLER_SLOT = "ai-autocomplete:controller";
export const AI_SUGGESTIONS_CONTROLLER_SLOT = "ai-suggestions:controller";
export const SEARCH_CONTROLLER_SLOT = "search:controller";
export const MULTIPLAYER_CONTROLLER_SLOT = "multiplayer:controller";
export const HISTORY_CONTROLLER_SLOT = "history:controller";
export const ANNOUNCER_SLOT_KEY = "pen.announcer";

/**
 * Tag placed on Yjs transaction origins by the undo manager. The rendering
 * layer checks this instead of relying on `constructor.name` (which breaks
 * under minification).
 */
export const HISTORY_ORIGIN_TAG = "__pen_history__";
