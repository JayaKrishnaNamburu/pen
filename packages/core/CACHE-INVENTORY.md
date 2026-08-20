# SCALE4 cache inventory

Canonical list of hot-path caches for Wave F step F.4 (`spec-v2/22-scale-envelope.md` SCALE4). A cache is in this inventory when it persists across commits and is consulted on the apply / decoration / suggestion / presence path. Listener sets, schema registries, one-shot local `Map`s, and current UI state (search matches, the visible autocomplete suggestion) are not caches.

SCALE4 accepts three bounds: a maximum entry count, a TTL, or a lifetime tied to a document / editor / DOM node (`WeakMap` or an index that only holds live document ids). A cache with none of those is **unbounded**.

No numbers in this file are invented. Named constants are cited only where the code already declares them. Runtime caches in `editor.ts`, `editorLifecycle.ts`, undo, and `@input/pen-ai` are inventoried, not edited.

`editor.destroy()` does not yet assert that these maps are released (H.6 / Wave 0.4 own teardown). The nightly soak is deferred with that assertion.

## Core (`@input/pen-core`)

| Cache | File | Bound or unbounded | Cleared on `editor.destroy()`? |
| --- | --- | --- | --- |
| Decoration block index (`DecorationSetImpl._blockIndex`) | `src/editor/decorations.ts:15` (field), `:20–30` (built in constructor), `:33–34` (`forBlock`). Held as `editor._decorations` (`src/editor/editor.ts:61`); replaced by `_refreshDecorations` (`:293–298`) from `dispatchCRDTEvent` (`src/editor/editorLifecycle.ts:294–296`). | **Document-scoped.** One key per unique `decoration.blockId` in that set. No entry cap. Replaced set is GC-eligible if nothing else retains it. | **No.** Destroy does not drop `_decorations`. |
| `DocumentState` position index (`_positionIndex`) | `src/editor/documentState.ts:16` (field), `:35` (init), `:65–66` (lookup), `:92–124` (`rebuild` replaces the map). | **Document-scoped.** One entry per top-level `blockOrder` id. No entry cap. | **No.** |
| `DocumentState` parent index (`_parentIndex`) | `src/editor/documentState.ts:17` (field), `:36` (init), `:73–74` (lookup), `:92–124` (`rebuild`). | **Document-scoped.** One entry per parented block (`props.parentId` or a parent's `children`). No entry cap. Full rebuild on structural change (`incrementalUpdate` `:127–158`). | **No.** |
| Change-summary `BlockIndex` (`blocks`, `children`) | `src/changes/blockIndex.ts:84–86`. Seeded/applied from `src/changes/install.ts:20–35`. Held at `src/editor/editor.ts:57`. | **Document-scoped.** One `blocks` entry per document block; `children` holds parents that have child ids. Incremental `apply` on each summary. No entry cap. | **No.** `teardownChangeSummaries` (`install.ts:39–42`) unsubscribes only. |
| Summary log ring (`SummaryLog.items`) | `src/changes/summaryLog.ts:5` (`SUMMARY_LOG_CAPACITY = 256`), `:8`, `:27–33` (evict oldest). Held at `src/editor/editor.ts:56`. | **Count-capped** at 256. | **No.** |
| Summary compose memo (`SummaryLog.memo`) | `src/changes/summaryLog.ts:9`, `:52–71` (compose cache), `:78–85` (drop keys overlapping an evicted commit). | **Unbounded** inside the live 256-commit window. No independent cap. | **No.** |
| `_blockRevisions` | `src/editor/editor.ts:60`. Written at `src/editor/editorLifecycle.ts:273–274` (one increment per affected block per commit). Read at `src/editor/editorApiHelpers.ts:200`. | **Unbounded.** One number per ever-touched block id. No `.delete` or `.clear` in the repository. | **No.** `destroyEditor` (`editorApiHelpers.ts:203–215`) does not clear it. |
| `Intl.Segmenter` module cache (`segmenters`) | `src/editor/textSegmentation.ts:23`, `:43–51` (`resolveSegmenter`). Key is `` `${locale}:${granularity}` ``. | **Unbounded.** Process-lifetime module `Map`. No entry cap, TTL, or weak key. Grows with distinct locale/granularity pairs. | **No.** Survives every editor. |
| Direction cache factory (`createDirectionCache`) | `src/direction/cache.ts:36–62`. One `Map` entry per `blockId`, fingerprinted against text/props (`:24–29`). Has `invalidate` / `clear`. **Not wired** to `EditorImpl` (no caller under `src/editor/`; not re-exported from `src/index.ts`). | **Document-scoped if used** (one entry per block; `clear()` exists). Unused today. | **N/A.** No editor hook. |
| Formatter cache factory (`createFormatterCache`) | `src/i18n/formatters.ts:27–64`. Three `Map`s (`pluralRules`, `numberFormats`, `dateTimeFormats`) keyed by `locale` + `JSON.stringify(options)`. **Not wired** to `EditorImpl` (not re-exported from `src/index.ts`). | **Unbounded** if used (no cap, no `clear`). Unused today. | **N/A.** No editor hook. |
| Facet empty-output memo (`emptyOutputs`) | `src/facets/registry.ts:59–62`, `:114–123` (`readUnregistered`). | **Weak-key.** `WeakMap` keyed by `Facet`. | **N/A.** Registry is not installed on `EditorImpl` (no `createFacetRegistry` under `src/editor/`). Registry has no `destroy`. |
| Facet slot / provider memos | `src/facets/compute.ts:23–24` (`provider.input`), `:30–31` (`slot.output`), `:107–145` (`resolveSlot`). Slots on `FacetComputeState` (`:34–41`, filled at `registry.ts:80–87`). | **Registry-scoped.** Tracks the live provider list. No entry cap. | **N/A.** Same as above. |
| Inline-completion leases | `src/editor/inlineCompletion.ts:12–15`. | **Weak-key.** `WeakMap` keyed by `Editor`. Last `release()` deletes the lease and calls `controller.destroy()` (`:238–242`). | **Weak.** Not walked by `destroyEditor`. GC when the editor is collected if no lease remains. |

### Related session maps (not commit-path caches)

| Map | File | Bound or unbounded | Cleared on `editor.destroy()`? |
| --- | --- | --- | --- |
| Document session scope indexes (`_scopes`, `_guidToScopeId`, `_scopeIdsByOwnerKey`, `_listenersByScope`) | `src/editor/documentSession.ts:55–58`. | Live scopes / guids / owners, not a result cache. | **Yes, if the session destroys.** `destroyEditor` calls `_releaseSession` (`editorApiHelpers.ts:212`). Session `destroy()` (`documentSession.ts:305–308`) clears the maps when `destroyWhenIdle` fires or the session is destroyed directly. |
| Apply-pipeline unknown-type dedupe (`_unknownBlockTypesReported`) | `src/editor/applyPipelineRunner.ts:91–96`, written `:101–105`. | **Unbounded.** One entry per distinct unknown block type seen. | **No.** |
| Schema-engine dirty / deferred sets | `src/schema/normalize.ts:91–92`. Cleared / drained during `normalize` (`:133`). | Work queues, not a result cache. Size tracks in-flight dirty blocks. | **No.** |
| Editor slots (`_slots`) | `src/editor/editor.ts:50`. | Registry, not a cache. | **No.** |
| Extension registry / state (`_extensions`, `_stateMap`) | `src/editor/extensionManager.ts:15–17`. `_stateMap.clear()` after `deactivateAll` (`:160`). | Registry, not a cache. | **Partial.** `_stateMap` cleared; `_extensions` kept. |
| Event handlers (`_handlers`) | `src/editor/events.ts:6`. | Listener set, not a cache. | **Yes.** `destroyEditor` → `removeAllListeners()` (`events.ts:65`). |

One-shot locals (`pendingBlockTypes` in `applyPipelineRunner.ts:226`, cell-selection indexes in `cellSelection.ts:104–116`, facet topo maps in `registry.ts`) are not retained.

## Sibling packages (noted, not edited)

SCALE4 names the AI suggestion caches and undo stacks. These live outside `@input/pen-core`. This step does not edit them.

| Cache | File | Bound or unbounded | Cleared on destroy? |
| --- | --- | --- | --- |
| AI `analysisCache` | `packages/extensions/ai-suggestions/src/controller.ts:60`, prune `:645–654`, TTL `DEFAULT_CACHE_TTL_MS` (`constants.ts:9`, 5 min). | **TTL only.** Unbounded entry count within TTL. | **Yes.** `controller.destroy()` `:441`. |
| AI `dismissedFingerprints` | `controller.ts:61`, prune `:657–660`, TTL `DEFAULT_DISMISS_MEMORY_MS` (`constants.ts:10`, 10 min). | **TTL only.** Unbounded entry count within TTL. | **Yes.** `controller.destroy()` `:442`. |
| AI scheduler `dirtyBlocks` | `packages/extensions/ai-suggestions/src/scheduler.ts:29`. | **Unbounded** until consume / reset. | **Yes.** `scheduler.destroy()` → `reset()` `:48–51`. |
| AI scheduler `lastRequestedAtByBlock` | `scheduler.ts:30`. Cooldown `DEFAULT_COOLDOWN_MS` (10s) gates *when* a block may be requested; it does not evict. | **Unbounded** until reset / destroy. | **Yes.** Same reset. |
| Undo / redo stacks | `packages/crdt/yjs/src/undo.ts:15` (`DEFAULT_UNDO_MAX_DEPTH = 500`), trim `:36–39`. Also `packages/extensions/undo/src/undoExtension.ts:27`. | **Count-capped** at 500 (CH7). | **Yes.** `UndoManagerImpl.destroy()` (`undo/src/undoManager.ts:154–159`) tears down the CRDT undo manager. |
| GeometryReader per-block cache | `packages/rendering/dom/src/geometry/geometryReader.ts:116`, `dispose()` `:285–288`, `clearCache()` `:320–323`. Standalone Wave 3.2; not wired to DomScheduler. | **Reader-scoped.** No entry cap. Cleared on dispose, commit-id change, resize/font generation. | **Yes, on `dispose()`.** Sibling `blockCommitIds` (`:117`) is not cleared. |
| `inlineAtomElementData` | `packages/rendering/dom/src/field-editor/inlineAtomDom.ts:22`. | **Weak-key** (`HTMLElement`). | Weak. |
| Field-editor selection authority | `packages/rendering/dom/src/field-editor/selectionAuthority.ts:31–34`. | Count-bounded by the six-source enum. | Not walked by `editor.destroy()`. |
| Yjs awareness wrappers | `packages/crdt/yjs/src/awareness.ts:7`, `:14`. | **Weak-key.** | Weak. |
| Yjs load reports | `packages/crdt/yjs/src/loadDocument.ts:60`. | **Weak-key** (`Y.Doc`). | Weak. |
| Yjs summary sources | `packages/crdt/yjs/src/summarySource.ts:69`. | **Weak-key** (`Y.Doc`). | Weak. |
| History / multiplayer scope runtimes | `packages/extensions/history/src/scopeRuntime.ts:5`, `packages/extensions/multiplayer/src/scopeRuntime.ts:17`. | Outer `WeakMap` by owner; inner `Map` by scope id. | Weak on the owner. |
| `AuthorLedger.entriesByClientId` | `packages/extensions/multiplayer/src/presence/authorLedger.ts:8`. | **Unbounded** (ever-seen client ids). No delete / cap. | Not cleared. |
| `ClientIdentityMap.map` | `packages/extensions/multiplayer/src/presence/identityMap.ts:36`. | **Unbounded** (ever-seen client ids). | Not cleared. |
| Presence peer cap constant | `packages/extensions/multiplayer/src/presence/constants.ts:23` (`MAX_TRACKED_PEERS = 32`), `:20` (`MAX_PRESENCE_UPDATES_PER_SECOND = 10`). | Cap is declared. No ingest `Map` (`trackedPeers` / `accepted` / `updateStamps`) is present in this tree; `presenceIngest.ts` is absent. | N/A. |
| `ExternalInlineTurnRegistry.results` | `packages/extensions/ai/src/runtime/externalInlineTurnRegistry.ts:14`. | **Unbounded.** No `clear` / `destroy`. | **No.** |

## Still unbounded (no cap, no TTL, no weak/document-scoped drop)

1. **`_blockRevisions`** — one entry per ever-touched block; not cleared on destroy. H.6 owns destroy-time clear.
2. **`SummaryLog.memo`** — no independent cap inside the 256-commit ring.
3. **`segmenters`** — process-lifetime `Intl.Segmenter` map; not editor-scoped.
4. **`createFormatterCache` maps** — unbounded if a caller ever holds one (unused today).
5. **`_unknownBlockTypesReported`** — one entry per distinct unknown type; not cleared on destroy.
6. **AI `analysisCache`** — TTL only; unbounded inside the TTL window. Sibling.
7. **AI `dismissedFingerprints`** — TTL only; unbounded inside the dismiss-memory window. Sibling.
8. **AI `lastRequestedAtByBlock` / `dirtyBlocks`** — no TTL eviction; grow until controller reset / destroy. Sibling.
9. **`AuthorLedger` / `ClientIdentityMap`** — ever-seen peers. Sibling.
10. **`ExternalInlineTurnRegistry.results`** — ever-registered external inline turns. Sibling.

Document-scoped indexes (decoration block index, `DocumentState` position/parent maps, `BlockIndex`) are **not** in this list: their lifetime is the live document / decoration set. They have no numeric cap.

## Destroy (deferred)

`destroyEditor` (`src/editor/editorApiHelpers.ts:203–215`) deactivates extensions, tears down observation, and releases the session. It does not clear `_blockRevisions`, `_decorations`, `_summaryLog`, `_blockIndex`, `_documentState`, `_slots`, or the module-level `segmenters` map. AI suggestion maps *are* cleared from `AISuggestionsControllerImpl.destroy` when that extension deactivates. The standing “destroyed editor retains nothing” assertion is H.6 / Wave 0.4, not this inventory.
