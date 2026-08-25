# Field-editor teardown

H.6 / F21 inventory. What `FieldEditor.destroy()` must release, what `FieldEditorImpl.destroy()` actually releases today, and what is still open. This is not a completeness claim.

There is no `dispose()` on the field editor. The public method is `destroy()` (`packages/types/src/types/fieldEditor.ts`). Adjacent modules use `destroy` (announcer) or `dispose` (geometry, reduced-motion).

## Ownership

Core `editor.destroy()` does not tear down an attached field editor (F21). Hosts own that call.

Shipped hosts already do it on unmount:

- React `EditorRoot` — `packages/rendering/react/src/primitives/editor/root.tsx`
- Vue `PenEditor` — `packages/rendering/vue/src/components/PenEditor.ts`

Those hosts also clear the field-editor slots and their own `focusin` / `focusout` / document `keydown` listeners. `FieldEditorImpl.destroy()` does not clear slots or host listeners. A headless or custom host that constructs `FieldEditorImpl` and never calls `destroy()` leaks the editor subscriptions below.

## `destroy()` sequence today

`FieldEditorImplRuntime.destroy()`:

1. Unsubscribe editor `onSelectionChange` and `onHistoryApplied`.
2. `SessionReconciler.destroy()`.
3. `_deactivate({ restoreFocus: false })` — backend `deactivate()`, cell coord clear, session flags, `HistorySelectionCoordinator.reset()`, `FieldEditorSelectionCoordinator.reset()`, pending-mark reset, deactivate listeners, store notify.
4. Clear activate / deactivate / store listener sets.
5. `FocusController.destroy()`.

`_deactivate` is what tears down the live input backend. `destroy()` is what tears down the long-lived editor subscriptions that outlive a single session.

## Must-release inventory

Status:

- **Released** — `destroy()` / backend `deactivate()` drops it.
- **Guarded leftover** — a scheduled callback can still fire after `destroy()`, but the live path no-ops. Not cancelled.
- **Open** — still held, or a later callback can re-enter a destroyed editor.
- **Not owned** — field editor never constructs it. Whoever creates it must release it. When a later wave wires it into the field-editor session, `destroy()` must call through.

### Editor subscriptions

| Resource | Status |
| --- | --- |
| `editor.onSelectionChange` (`_unsubscribeSelection`) | Released |
| `editor.onHistoryApplied` (`_unsubscribeHistoryApplied`) | Released |
| `SessionReconciler` `onDocumentCommit` | Released |
| `SessionReconciler` `decorationsChange` | Released |
| Activate / deactivate / store listener sets | Released |
| Focus-lifecycle listeners (`FocusController`) | Released |
| `waitForAttachment` waiter set (promises resolve `false`) | Released |
| Field-editor slots (`FIELD_EDITOR_SLOT_KEY` / core slot) | Open — host must clear. React and Vue do. |
| `_rootElement` | Open — left pointing at the last root. |
| `_editor` reference | Open — retained after destroy. |
| Select-all cycle (`SelectAllController`) | Gone — core computes the T1 rung from selection state, so there is no cycle to leak. |

### Observers

| Resource | Status |
| --- | --- |
| ContentEditable `MutationObserver` on the attached element | Released in `ContentEditableBackendCore.deactivate()` |
| ContentEditable `ytext.observe` | Released (`unobserve`) |
| EditContext `ytext.observe` | Released (`unobserve`) |
| ContentEditable / EditContext `decorationsChange` | Released in backend `deactivate()` |
| Expanded backend Y.Text / mutation observers | Not used — that backend has neither |
| Geometry `ResizeObserver` on the content root | Not owned — see Geometry |
| `document.fonts.ready` bump | Not owned — see Geometry |

### Listeners (input backends)

Released by the matching `deactivate()`, which `destroy()` reaches through `_deactivate`.

ContentEditable (`contenteditableBackendCore.ts`): `beforeinput`, `compositionstart`, `compositionend`, `keydown`, `copy`, `cut`, `dragstart`, `drop`, `pointerdown`, document `selectionchange`. `contentEditable` set back to `"false"`.

EditContext (`editContextBackendCore.ts`): element `keydown`, `copy`, `cut`, `paste`, `dragstart`, `drop`, `pointerdown`, document `selectionchange`; EditContext `textupdate`, `textformatupdate`, `characterboundsupdate`. `element.editContext` nulled. The `EditContext` object is dropped; it has no separate destroy API.

Expanded (`expandedContentEditableBackend.ts`): `beforeinput`, `keydown`, `copy`, `cut`, `dragstart`, `drop`, document `selectionchange`. `contentEditable` `"false"`, `tabindex` removed.

Host `focusin` / `focusout` / document `keydown` (React root, Vue `PenEditor`): not owned. Those hosts remove them on unmount. A custom host must do the same.

### Scheduled frames (geometry-adjacent, selection, IME)

None of these go through `DomScheduler`. `DomScheduler` itself is not constructed by the field editor and has no `destroy()`.

| Resource | Status |
| --- | --- |
| Session reconciler flush `requestAnimationFrame` | Released (`cancelAnimationFrame`) |
| ContentEditable `pendingDomSyncFrame` | Released (`cancelAnimationFrame` in `deactivate()`) |
| ContentEditable Safari composition-end frame | Guarded leftover — `deactivate()` nulls `element`; the callback returns. Not cancelled. |
| `FocusController.waitForAttachment` frames | Guarded leftover — waiters marked `done`; frames not cancelled. |
| `FieldEditorSelectionAuthority.withSelectionWrite` | Same-turn — raises apply-depth, runs the write, releases in `finally`. No frame. `reset()` zeros depth; there is nothing to cancel. (`applySelectionUntilNextFrame` is deleted.) |
| `SelectionProjectionController.syncDomSelectionOnce` (up to 4 retries + follow-up frame) | Guarded leftover — callback bails when `!isEditing()`. `reset()` does not cancel the frames. |
| `CellEditingController.trySyncBackend` (up to 3 retries) | Guarded leftover — `clear()` nulls the coord so the callback returns. Not cancelled. |
| Expanded `beforeinput` frame that calls `activateTextSelection` after `deactivate()` | **Open** — untracked. A `destroy()` in the same turn does not cancel it; the callback can start a new session on a destroyed editor. |

`_deactivate({ restoreFocus: false })` skips restore focus. Destroy does not leave a programmatic focus call queued.

### Announcer

`createAnnouncer` (`src/a11y/announcer.ts`) is the AX2 live region: one `role="status"` node, rate-limit timers (500ms), `announce` / `destroy`.

`Announcer.destroy()` must release:

- pending `setTimeout` keys (`clearTimeout`)
- pending / last-written maps
- the live-region node (`region.remove()`)

That path exists and is tested. **The field editor does not construct an announcer.** Wave X.3 has not wired conversion / undo / selection announcements. React still has ad-hoc `aria-live` nodes in `selectionRect.tsx`; those unmount with the primitive, not via `FieldEditor.destroy()`.

When X.3 attaches one announcer per editor root, the owner that calls `createAnnouncer` must call `announcer.destroy()` on the same teardown as `FieldEditor.destroy()`. Until that wire exists, field-editor destroy cannot leak an announcer it never created — and it also cannot clean one a host created on the side.

### Geometry

`createGeometryReader` (`src/geometry/geometryReader.ts`) is the Wave 3.2 reader. `dispose()` must release:

- `ResizeObserver` on the content root (`disconnect`)
- per-block measure cache
- the disposed flag so a late `fonts.ready` callback does not bump generations

`dispose()` exists. It does **not** cancel `document.fonts.ready` (the promise has no abort; the callback is only guarded). `blockCommitIds` is not cleared (harmless once disposed).

**The field editor does not construct a GeometryReader.** Wave 3.2 note: not wired to DomScheduler, overlays, field-editor, React, or Vue. Field-editor paths still measure through `selectionBridge` / `selectionGeometry` (sync reads, no observer).

When 3.3/3.4 attach a reader to the root, the owner must call `reader.dispose()` on the same teardown as `FieldEditor.destroy()`. Until then, field-editor destroy has no geometry observer to drop.

### Adjacent modules (not field-editor owned)

Listed so this file does not imply they ride along:

| Module | Release API | Wired to field editor? |
| --- | --- | --- |
| `createAnnouncer` | `destroy()` | No |
| `createGeometryReader` | `dispose()` | No |
| `createReducedMotionSignal` | `dispose()` (removes `matchMedia` `change`) | No |
| `DomScheduler` | none — pending `requestAnimationFrame` is never cancelled | No |
| Overlay layer (conformance harness `harness/src/overlays/`) | host unmount of the layer node | No |

## Still open

- Core `editor.destroy()` still does not call field-editor `destroy()` (F21). Hosts must.
- Slots, `_rootElement`, and the editor reference survive field-editor `destroy()`.
- Untracked `requestAnimationFrame` work is not cancelled. The expanded-mode activate-after-deactivate frame can re-enter after destroy. The others are guarded but still run.
- Announcer, GeometryReader, reduced-motion, and DomScheduler are standalone. Their own destroy/dispose (or lack of one, for the scheduler) is not part of `FieldEditor.destroy()`.
- `destroy()` is not documented as idempotent. A second call runs `SessionReconciler.destroy()` again.

Fixing those is later H.6 / Wave 3 / Wave X work. This file only records the gap.
