# Field-editor input backends

HOST4 (`spec-v2/15-host-integration.md`): `EditContext` is newer than the HOST3 browser floor. The field editor detects it and falls back; it does not require it. Browser floors live in the root `README.md` support table.

Selection of the backend is `_resolveBackendClass` in `src/field-editor/fieldEditorImplRuntime.ts`. The named split is `FIELD_EDITOR_BACKEND_SPLIT` in that file. Detection and fallback are unchanged by this document.

## Detection

On a single-block field that is not a table cell, the runtime uses EditContext when `globalThis.EditContext` is a constructor (`"EditContext" in globalThis` and `typeof EditContext === "function"`). That is Chromium 121+ today. Firefox and Safari have no constructor, so they never take this branch.

## Fallback

Missing EditContext selects `ContentEditableBackend`. That path is real: the element gets `contentEditable = "true"` and input goes through `beforeinput`, `compositionstart` / `compositionend`, and a mutation observer.

Two surfaces always use contenteditable, even when EditContext exists:

- expanded (multi-block) editing → `ExpandedContentEditableBackend`
- table-cell editing → `ContentEditableBackend`

## User-visible degradation

The field stays editable. Typing, paste, and undo still apply.

Without EditContext, IME is the contenteditable composition-event path instead of EditContext `textupdate`:

- A commit is recognised from the event sequence, not from a clock. If the live DOM already differs from the recorded start text, or `compositionend.data` is already in the field, the fallback reconciles in the same turn.
- Safari may fire `compositionend` before the last DOM mutation. The start text stays recorded, and the sequence completes on the following mutation — or, for a GBoard fast cycle where a second `compositionstart` arrives first, on that `compositionstart`, which flushes the leftover so the earlier commit is not dropped.
- Composition underline and IME candidate-window bounds follow the native contenteditable caret. EditContext paints underline from `textformatupdate` and reports character bounds via `characterboundsupdate`.

This replaced a 50ms `Date.now()` window plus a `requestAnimationFrame` retry, which stood in for "the field already has the committed text" and got it wrong twice: a multi-character commit missed the same-turn path, and a second `compositionstart` arriving before the rAF made it bail and drop the first commit (conformance C3).

`FieldEditorImpl.destroy()` deactivates the current backend (element and document listeners, MutationObserver, Y.Text observer, EditContext) and then drops the long-lived editor subscriptions. Core `editor.destroy()` does not. What that call actually releases, and what is still open (including announcer and geometry, which the field editor does not own), is in `FIELD-EDITOR-TEARDOWN.md`.
