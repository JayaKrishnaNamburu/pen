# Errata Ledger

Consolidated errata from all wave specs. Each item is triaged into one of three dispositions before the wave's implementation begins:

- **Fixed in spec** — the issue has been resolved by a spec amendment; no implementation action needed.
- **Implementation-required** — confirmed as a mandatory fix during build; the wave implementer must address it.
- **Deferred** — moved to backlog with explicit rationale.

This ledger is the single source of truth. The "Known Errata" sections in individual wave specs remain for context, but this ledger governs disposition.

---

## Wave 3 — Editor Core

Source: `spec/wave-03-editor-core.md`, "Known Errata (Fix During Implementation)"

| # | Summary | Disposition | Notes |
|---|---|---|---|
| 1 | `documentChange` event must be emitted by the apply pipeline | Implementation-required | Wave 5 rendering depends on this event. |
| 2 | `onBeforeApply` hooks must be invoked in priority order | Implementation-required | Wave 7 (suggest mode) and Wave 9 (input rules) depend on this. Hooks run before validation. |
| 3 | `DocumentStateImpl` must implement full `DocumentState` interface (`blocks`, `isEmpty`, `allBlocks()`) | Implementation-required | `allBlocks()` must recursively walk layout children. `blockAt()` returns `string \| null`. |
| 4 | `_splitBlock` must use `initBlockMap` to create new blocks (meta Y.Map invariant) | Implementation-required | Violates Wave 1 invariant if meta is missing. |
| 5 | `replaceSelection` must batch delete + insert ops in a single `apply()` call | Implementation-required | Separate calls create separate undo groups. |
| 6 | `requestDecorationUpdate()` must be implemented on `EditorImpl` | Implementation-required | Required by search (W9), collab (W8), track changes (W7). |
| 7 | `editor.schema` getter must be exposed | Implementation-required | `EditorImpl` stores `_registry` internally but must expose it. |
| 8 | `set-meta` stores data as plain JSON values, not nested Y.Maps | Implementation-required | Last-writer-wins per namespace is intentional. Extensions needing field-level merging use `adapter.transact()` directly. |
| 9 | `editor.clientId` must be exposed | Implementation-required | Cached from `adapter.getClientId(crdtDoc)`. Used by streaming target, undo, awareness. |
| 10 | `EditorInternals.engine` typing | Fixed in spec | Resolved inline — extensions use `getSlot<SchemaEngineImpl>('core:engine')`. |
| 11 | `EditorImpl.destroy()` must call `awareness?.destroy()` | Fixed in spec | Resolved inline — awareness destroyed after extension deactivation, before CRDT observer removal. |

---

## Wave 4 — Transports & Importers

Source: `spec/wave-04-transports-importers.md`, "Known Errata (Fix During Implementation)"

| # | Summary | Disposition | Notes |
|---|---|---|---|
| 1 | HTML importer `import()` must be `async` | Fixed in spec | Resolved inline. |
| 2 | `blocksToOps` must live in `@pen/core/importer-utils.ts` as shared utility | Implementation-required | Both markdown and HTML importers use it. |
| 3 | `PendingBlock` type must be defined once in `@pen/core/importer-utils.ts` | Implementation-required | Remove local redeclarations. |
| 4 | Add `handleCut` implementation | Implementation-required | Cut = copy + `editor.deleteSelection()`. Also referenced by Wave 5 errata #8. |
| 5 | Exporters must use `BlockHandle` APIs, not raw CRDT access | Implementation-required | Use `handle.textContent()` and `DocumentState.allBlocks()`. |
| 6 | Add `list-grouper.ts` for markdown export | Implementation-required | Consecutive list items need wrapping logic. |
| 7 | `composeAbortSignals` should use `AbortSignal.any()` where available | Implementation-required | Falls back to manual listener composition. |
| 8 | SSE `eventHistory` must be accessible to `handleReconnect` | Fixed in spec | Resolved inline — shared `streamHistories` Map. |

---

## Wave 5 — React Rendering Layer

Source: `spec/wave-05-react-rendering.md`, "Known Errata (Fix During Implementation)"

| # | Summary | Disposition | Notes |
|---|---|---|---|
| 1 | `FieldEditorImpl` extends the `FieldEditor` interface | Fixed in spec | Resolved in Wave 0 types. |
| 2 | `BlockSchema.fieldEditor` type updated | Implementation-required | Resolve string tags to built-in factory functions in rendering layer. Fixed type shape in Wave 0. |
| 3 | Specify `cross-block.ts` module | Implementation-required | Must handle contenteditable scope expansion, shared Y.Text observation, and contraction. |
| 4 | Specify `selection-bridge.ts` module | Implementation-required | DOM-to-CRDT selection mapping (window.getSelection to blockId/offset pairs). |
| 5 | Specify `computeTextDiff` algorithm | Implementation-required | O(n) scan from both ends; Myers diff fallback for regions >256 chars. |
| 6 | `saveSelection` must use offset-based references | Implementation-required | DOM node references go stale after reconciliation. |
| 7 | ContentEditable backend Mode 3 must apply marks on insert | Implementation-required | Resolve marks at insertion position before inserting text. |
| 8 | Add `handleCut` to clipboard pipeline | Implementation-required | Duplicate of Wave 4 errata #4; shared implementation. |
| 9 | `NumberedListItemRenderer` counter management | Implementation-required | Synthetic counter tracking for flat list model. |
| 10 | Virtualization must not unmount active field editor block | Implementation-required | Add active block IDs to always-render set. |
| 11 | `useEditor` should only destroy self-created editors | Implementation-required | Pre-existing editors passed by consumer must not be destroyed on unmount. |
| 12 | ContentEditable backend `compositionend` handler must use `requestAnimationFrame` | Implementation-required | Safari fires `compositionend` before final DOM update. |

---

## Wave 11 — Apps, Execution & Branching

Source: `spec/wave-11-apps-execution.md`, "Known Errata (Fix During Implementation)"

| # | Summary | Disposition | Notes |
|---|---|---|---|
| 1 | iframe bridge must validate message payloads | Implementation-required | Rate limiting, JSON schema validation, scope restriction. |
| 2 | `splitCommand` must handle quoted arguments | Implementation-required | Replace naive split with shell-word parser. |
| 3 | `checkPermission` must separate command vs path checks | Implementation-required | Split into `checkCommandPermission` and `checkPathPermission`. |
| 4 | Network isolation limitation must be documented | Implementation-required | Env var removal is not true isolation; document and recommend OS-level sandboxing. |
| 5 | Branching needs a persistence story | Implementation-required | Add `PenPersistence` integration for branch state. |
| 6 | Implement `diff.ts` for branch diffing | Implementation-required | State vector delta computation + per-block change summaries. |
| 7 | `editor.internals.doc.id` does not exist | Implementation-required | Pass doc ID as parameter from branching extension config. |
| 8 | `AppEditorAPI.readDocument` must use `DocumentState.allBlocks()` | Implementation-required | Include layout children. |

---

## Cross-Wave Consistency Notes

**Coverage.** Waves 0, 1, 2, 6, 7, 8, 9, 10, and 12 do not have a "Known Errata" section in their specs. They were reviewed and have no outstanding items requiring ledger tracking. If errata surface during implementation of those waves, they should be added to this ledger.

The following consistency items are validated against the Milestone Decision Locks in Spec Section 21:

| Check | Status | Notes |
|---|---|---|
| Canonical package name `@pen/collaboration` used consistently | Verified | Wave specs reference both `@pen/collaboration` and `@pen/collab` in prose; implementation must use `@pen/collaboration`. |
| Metadata writes flow through `set-meta` pipeline | Verified | Wave 3 errata #8 confirms last-writer-wins semantics. |
| `editor.internals` boundary policy respected | Verified | No wave spec exposes additional facade beyond `getSlot()`. |
| `handleCut` specified in one place | Noted | Duplicated across Wave 4 (#4) and Wave 5 (#8). Implementation should be shared; clipboard pipeline owns it. |
| `allBlocks()` requirement propagated | Noted | Waves 3, 4, 5, 11 all require `allBlocks()` for layout child traversal. Single implementation in `DocumentStateImpl`. |
| Diagnostics carry structured codes | Verified | Updated in Wave 0, Wave 3, and Wave 6 acceptance criteria per Spec Section 22. |
