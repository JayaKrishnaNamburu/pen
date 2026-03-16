# Wave 8 Hardening RFC

**Status:** Foundation slices landed; follow-up items remain open

**Related packages:** `@pen/types`, `@pen/core`, `@pen/crdt-yjs`, `@pen/multiplayer`, `@pen/history`, `@pen/react`

**Related docs:** `spec/wave08CollaborationHistory.md`, `spec/wave01CrdtLayer.md`, `spec/wave05ReactRendering.md`, `spec/publicApiRfc.md`

---

## Goal

Document the hardening work that stabilized the Wave 8 architecture around three seams before they became entrenched public behavior:

- collaboration runtime ownership
- durable author identity for history and blame
- snapshot restore semantics under shared document scope

This RFC does not reject the original Wave 8 direction. It records the hardening changes that preserved the package split and transport boundary while moving the most important runtime invariants up from editor-local ownership to document-scope ownership.

---

## Summary

The current branch was directionally strong from the start:

- transport remains outside Pen
- Yjs-specific integration stays inside `@pen/crdt-yjs`
- headless behavior lives in `@pen/multiplayer` and `@pen/history`
- React bindings stay in `@pen/react`

The main issue this RFC addressed was that several behaviors were still owned by an individual `Editor` even though Wave 8 explicitly models collaboration and awareness per document scope.

This RFC landed:

1. one collaboration runtime per document scope, not per editor
2. one durable author ledger per document scope, not a live-only `clientId -> user` map
3. one restore authority at the document-session scope, not `editor.loadDocument()` on an arbitrary attached editor

Still-open follow-up:

1. snapshot preview as a separate history mode
2. persistence of author-ledger data beyond the in-memory runtime lifecycle
3. completion of the richer history and multiplayer product UI surface

---

## Why Harden Now

If these ownership boundaries stay as-is, the code will still build and tests will still pass, but Pen will accumulate product-level contradictions:

1. multiple editors on one shared document can create duplicated provider sessions
2. restore can silently fork one editor away from its siblings
3. blame can degrade from a real author to `User 12345` after reconnect or reload
4. future subdocument collaboration will inherit editor-local assumptions that are expensive to unwind

These are architecture issues, not implementation polish issues.

---

## Confirmed Strengths

These decisions from the current branch should be preserved:

1. **External provider boundary.** Pen should not own websocket transport, reconnect policy, or Yjs sync protocol framing.
2. **Yjs adapter isolation.** Raw `Y.Doc` and raw Yjs `Awareness` should only cross the Pen boundary through `@pen/crdt-yjs`.
3. **Headless feature packages.** `@pen/multiplayer` and `@pen/history` should remain runtime packages, not UI packages.
4. **React bindings in `@pen/react`.** Hooks and primitives should remain composition-only.
5. **Awareness as ephemeral state.** Presence, cursor, and selection remain ephemeral and session-scoped.

This RFC changes ownership and identity durability, not the core package map.

---

## Problems This RFC Addressed

## 1. Collaboration Ownership Was Editor-Local

Today each editor activation may construct its own `MultiplayerSession`.

That conflicts with the Wave 8 scope model:

- awareness is per document scope
- multiple local editors may attach to the same `DocumentSession`
- one human should not appear twice in the same local scope

Provider lifecycle should follow the shared scope, not a mounted editor.

## 2. Attribution Identity Was Not Durable

Yjs `clientID` is a session identifier, not a durable author identifier.

The current history path derives authorship like this:

- adapter returns `clientId` from CRDT metadata
- history tries to resolve that through the live multiplayer identity map
- if no live mapping exists, history falls back to `User ${clientId}`

That is acceptable for live presence and unacceptable for long-term blame.

## 3. Restore Authority Was Too Narrow

Today `SnapshotManager.restoreSnapshot()` loads the restored document through one editor instance.

That is safe for a single isolated editor.

It is not the right authority for:

- multiple editors attached to one shared session
- active multiplayer sessions
- future history preview modes
- subdocument scope restores

Restore must become a scope-level operation with explicit behavior.

## 4. Wave 8 Spec Scope Was Larger Than The Landed Surface

The current implementation includes the right foundations, but the spec still describes a fuller product surface than is actually present today.

This was resolved by:

- hardening the foundations first
- splitting remaining product UI into a follow-up milestone

---

## Design Principles

1. **Scope beats editor.** Shared collaboration state belongs to `DocumentSession` scope, not to an arbitrary attached editor.
2. **Durable author identity beats session identity.** History should resolve to stable `userId` semantics, not only Yjs `clientId`.
3. **Restore must be explicit.** Pen should distinguish previewing a past state from replacing the active shared scope.
4. **Do not expand Yjs leakage.** Hardening should improve ownership boundaries without making Yjs a public dependency of feature packages.
5. **Preserve the current package split.** The current package map is mostly right; the runtime seams are what need adjustment.
6. **Ship in phases.** The fix should not require a one-shot rewrite.

---

## Architecture Outcome

## A. Scope-Owned Collaboration Runtime

Landed: a scope-level runtime owns provider/session lifecycle for one `DocumentScope`.

Conceptually:

- `DocumentSession` owns the scope registry
- a collaboration runtime registry is keyed by `scopeId`
- editors attach to that runtime
- one runtime owns one external provider-backed session
- many editors can observe the same runtime state

### Landed Runtime Model

```ts
export interface MultiplayerScopeRuntime {
  readonly scopeId: string;
  readonly awareness: Awareness;
  readonly session: MultiplayerSession | null;

  getState(): MultiplayerState;
  subscribe(listener: () => void): Unsubscribe;

  connect(): void;
  disconnect(): void;
  destroy(): void;

  updateLocalSelection(
    editorId: string,
    selection: SelectionState,
  ): void;

  getIdentityMap(): ClientIdentityMapLike;
  getAuthorLedger(): AuthorLedgerLike;
}
```

This runtime is the owner of:

- connection state
- peer derivation
- awareness observation
- identity map updates
- durable author ledger updates

The editor-level extension becomes a thin adapter:

- locate or create the runtime for the current scope
- subscribe to runtime state
- publish local selection intent
- derive decorations from shared runtime state

### Config Surface Kept Stable

The current public config shape remains:

```ts
multiplayerExtension({
  user,
  session,
  sessionFactory,
})
```

Internally, the implementation now normalizes that editor-facing config into scope-owned runtime creation. The explicit `scopeSession` / `createScopeSession` rename described in the original RFC did not land and is not required for the current architecture to be correct.

### Why This Fixes The Model

This now makes the implementation match the stated Wave 8 rule:

- one awareness instance per document scope
- one collaboration runtime per scope
- many editors can observe the same scope

It also keeps provider lifecycle aligned with Yjs provider expectations, where a provider typically owns one `Y.Doc` plus one shared `Awareness` instance.

---

## B. Durable Author Ledger

Pen needs two identity layers, not one:

1. **session identity**
2. **durable author identity**

### Session Identity

Session identity is what live presence needs:

- `clientId`
- current cursor
- current selection
- live connected user metadata

This is ephemeral.

### Durable Author Identity

Durable author identity is what history needs:

- stable `userId`
- display name
- color/avatar if known
- a retained mapping from historical `clientId` values to stable author identity

This survives reconnects and reloads.

### Landed Types

```ts
export interface AuthorIdentity {
  id: string;
  name: string;
  color?: string;
  avatar?: string;
}

export interface AuthorLedgerEntry {
  clientId: number;
  author: AuthorIdentity;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface AuthorLedger {
  record(clientId: number, author: AuthorIdentity): void;
  resolve(clientId: number): AuthorIdentity | null;
  entries(): readonly AuthorLedgerEntry[];
}
```

### Ownership

The author ledger should live with the collaboration runtime or document scope, not with an individual React hook or history controller.

The ledger updates whenever awareness provides trustworthy user metadata:

```ts
authorLedger.record(clientId, {
  id: user.id,
  name: user.name,
  color: user.color,
  avatar: user.avatar,
});
```

### Persistence Strategy

Current state:

1. **Landed:** in-memory scope ledger for the active runtime
2. **Open follow-up:** persist ledger snapshots alongside version snapshots
3. **Open follow-up:** optional document-level author ledger storage for better long-range blame fidelity

### History Resolution Order

History attribution should resolve in this order:

1. scope author ledger
2. live multiplayer identity map
3. caller-provided fallback resolver
4. `User ${clientId}` fallback

That keeps history usable in single-user mode while making multi-session blame much more durable.

### Deferred History Hook Surface

```ts
export interface HistoryAuthorResolver {
  resolve(clientId: number): HistoryAuthor | null;
}

export interface HistoryConfig {
  persistence: PenPersistence;
  docId: string;
  autoSnapshot?: AutoSnapshotConfig | false;
  authorResolver?: HistoryAuthorResolver;
}
```

This remains a reasonable future extension if Pen wants caller-provided author resolution, but it did not need to land for the current hardening work. The current implementation instead resolves through the multiplayer controller slot when present and otherwise falls back cleanly in single-user mode.

---

## C. Scope-Level Restore Semantics

Restore needs two explicit modes:

1. **preview**
2. **replace active scope**

The current implementation implicitly does "replace active editor document", which is not a stable product concept.

### Mode 1: Snapshot Preview

Preview should create a read-only forked document for comparison, diffing, or historical inspection.

This mode:

- does not replace the active shared scope
- does not disconnect collaborators
- is safe during active collaboration
- is the right substrate for timeline browsing and diff UI

Deferred shape:

```ts
export interface SnapshotPreviewHandle {
  readonly snapshotId: string;
  readonly doc: CRDTDocument;
  dispose(): void;
}

export interface HistoryController {
  openSnapshotPreview(snapshotId: string): Promise<SnapshotPreviewHandle>;
}
```

Status: this mode is still deferred. The preview abstraction remains a sensible next step for timeline browsing and diff UI, but it is not part of the landed hardening slice.

### Mode 2: Replace Active Scope

Landed: replacing the active scope is now owned by the document session, not by a single editor.

Current core capability:

```ts
export interface ReplaceScopeDocumentOptions {
  destroyReplacedDoc?: boolean;
}

export interface DocumentSession {
  replaceScopeDocument(
    scopeId: string,
    doc: CRDTDocument,
    options?: ReplaceScopeDocumentOptions,
  ): void;
}
```

This operation should:

1. pause or disconnect the scope collaboration runtime if needed
2. replace the shared scope document
3. rebind all attached editors to the new scope document
4. recreate or reattach awareness and observers coherently
5. notify extensions through normal lifecycle boundaries

### Outcome

This RFC removed the original safety caveat for shared-scope restore. History restore now rebinds through the session boundary when a `DocumentSession` exists, and falls back to standalone editor reload only when no shared session is present.

---

## D. React Surface Split

The current branch has the right foundational hooks and a small set of multiplayer primitives.

The spec should explicitly separate:

1. **Wave 8 foundations**
2. **Wave 8 product UI surface**

### Wave 8 Foundations

- scope-owned collaboration runtime
- provider session wrapping
- awareness publishing
- peer state
- history controller
- snapshot CRUD
- attribution and author resolution
- React hooks for reading state

### Wave 8 Product UI Follow-Up

- full history timeline primitives
- diff primitives
- restore button primitives
- richer multiplayer primitives
- AI presence UI if still desired

This split is now reflected in `spec/wave08CollaborationHistory.md`, which distinguishes the shipped foundation from the deferred product UI surface.

---

## Package Responsibilities After Hardening

### `@pen/types`

Owns:

- scope-based collaboration contracts
- durable author identity contracts
- session and restore capability interfaces if promoted to common types

Should not own:

- concrete runtime registries
- Yjs-specific provider details

### `@pen/core`

Owns:

- `DocumentSession` scope replacement semantics
- editor attachment to shared sessions
- shared scope lifecycle hooks

Should not own:

- external transport/provider construction
- feature-specific peer derivation logic

### `@pen/crdt-yjs`

Owns:

- raw Yjs interop
- provider session adaptation
- Yjs document snapshot restore helpers

Should not own:

- multiplayer runtime registries
- author identity persistence policy

### `@pen/multiplayer`

Owns:

- scope runtime state
- peer derivation
- presence and selection publication
- identity map plus author ledger updates

Should not own:

- transport protocol framing
- snapshot persistence

### `@pen/history`

Owns:

- snapshot listing and restore orchestration
- preview handles
- attribution shaping
- blame range construction

Should not own:

- live presence
- direct awareness observation

### `@pen/react`

Owns:

- hooks into multiplayer/history runtime state
- headless primitives for the currently shipped product UI

Should not own:

- hidden runtime state stores separate from controller/runtime truth

---

## Implementation Outcome

## Completed

1. Introduced scope-owned collaboration runtime.
2. Added in-memory author ledger.
3. Routed history attribution through the ledger first.
4. Added session-level scope replacement API in core.
5. Reworked history restore to use session-owned replacement.
6. Added multi-editor restore coverage.
7. Reconciled the public Wave 8 spec with the actually shipped foundation surface.

## Remaining Follow-Up

1. Add snapshot preview mode to history.
2. Persist author ledger data with snapshots or document metadata.
3. Add reload/reconnect attribution coverage once persistence lands.
4. Land any remaining history and multiplayer product UI primitives that still belong in the roadmap.

---

## Compatibility Strategy

The hardening work avoided a large breaking change by correcting ownership internally without forcing a public API rewrite.

### Recommended Compatibility Rules

1. keep `sessionFactory` and `session` as the stable config surface
2. normalize them internally into scope-owned runtime creation
3. keep `ClientIdentityMap` for live presence
4. introduce `AuthorLedger` as an additive concept
5. avoid a public config rename unless a later product need clearly justifies it

This lets current adopters keep moving while the ownership boundary stays correct internally.

---

## Testing Outcome

Landed hardening coverage includes:

1. two editors on one `DocumentSession` create only one scope session
2. multiple local editors share one runtime state and one peer view
3. disconnecting one editor does not destroy the shared scope session while another editor is still attached
4. history attribution resolves a disconnected author's stable identity from the ledger
5. session-level restore rebinds all attached editors coherently

Still-open follow-up coverage:

1. snapshot preview does not replace the active scope
2. subdocument scopes can own independent collaboration runtimes without contaminating the parent scope
3. reload/reconnect attribution fidelity once author-ledger persistence exists

---

## Acceptance Criteria

### Landed

1. Collaboration runtime ownership is defined per `DocumentScope`, not per mounted editor.
2. A single scope does not create duplicate provider sessions when multiple local editors attach.
3. History attribution resolves through a durable author ledger before falling back to live presence or `clientId`.
4. Replacing an active shared scope is owned by `DocumentSession` or equivalent scope authority, not by one editor instance.
5. The Wave 8 spec clearly separates shipped foundations from deferred product UI surface.

### Remaining Acceptance Gaps

1. The system distinguishes snapshot preview from replacing the active shared scope.
2. Durable author identity persists across reloads without requiring a live runtime ledger.

---

## Current Recommendation

For the current branch, keep the landed ownership model and treat the remaining work as explicit follow-up:

1. preserve the transport-agnostic and package-boundary work
2. keep scope-owned collaboration runtime as the stable foundation
3. keep author-ledger-first attribution as the stable foundation
4. add preview and persistent author identity only when the next product slice needs them
5. continue to keep richer React product UI in a follow-up milestone until it actually ships

This remains a refinement RFC, not a rewrite RFC.
