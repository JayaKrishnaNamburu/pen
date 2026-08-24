# Collaboration boundary

Pen guarantees two things when more than one client is on a document: **CRDT convergence** and **origin labeling**. The host owns everything else that looks like a product: auth, persistence, permissions, presence-payload policy, and schema agreement across peers.

This is COL5 (`spec-v2/19-collaboration-contract.md`). The docs site page is the same statement.

## What Pen guarantees

**Convergence.** The document store is a Yjs `Y.Doc`. Concurrent edits merge. After exchange, peers hold the same shared types (`blockOrder`, `blocks`, `apps`, `metadata`). Pen does not add operational transform, rebasing, a conflict UI, or a second merge algorithm. Where a result is Yjs's rather than Pen's (delete-beats-edit), that is a law, not a Pen choice.

**Origin labeling.** A remote update is labeled so this client's undo, suggestions, input rules, and history can tell it apart from local typing. `"user"` means this client's user. It is never a default for an unlabeled remote transaction. The label is for local reasoning; it is not a capability a peer can grant itself.

Pen does not provide a transport, a provider, a server, rooms, or presence infrastructure. The Yjs adapter and the multiplayer extension consume a host-provided provider. The playground `y-websocket` wiring is a demo.

## What the host owns

- **Auth.** There is no session, token, or trusted peer in the library. A peer that can write to the Yjs room can write to the whole document. Access control lives in the host's transport.
- **Persistence.** Pen does not store documents, manage rooms, or replay history. Offline editing is Yjs's guarantee: an offline client's edits converge when its provider reconnects. Pen adds no queue, backoff, or conflict UI.
- **Permissions.** Pen does not enforce per-user or per-block permissions. `pen.ariaReadOnly` sets `aria-readonly` only. Local typing stops when the host passes the `readonly` prop. Neither is a security boundary: both stop nothing arriving over the wire, and neither stops `editor.apply`.
- **Presence-payload policy.** Awareness contents are host-provided and visible to every peer. An email or internal id put in presence is broadcast. Pen does not authenticate those strings.
- **Schema agreement.** Pen does not merge document schemas between peers. Two clients on different registries against one document is a host deployment concern.

## Schema mismatch

Peers with different schema registries still **converge on the CRDT** and **diverge on rendering**. A block type one registry knows and the other does not remains in the shared document; the older (or different) client cannot edit it in place and will not render it as the authoring client did.

DUR3 (`spec-v2/18-document-durability.md`) is what keeps that mismatch non-destructive. Unknown blocks keep their type, props, content, and children through load, normalization, re-encode, copy, and JSON export. Both built-in registry factories set `onUnknownBlock` to `"passthrough"`. Apply still refuses to *create* an unknown type — preservation is about existing content, not about inventing writes the schema cannot describe.

A staged rollout that ships a new block type to some clients first survives because the others keep the bytes.

## Evidence plan

Do not read this page as a claim that the full Wave C suite is in-tree.

The proof plan is the scenario list in `spec-v2/waves/wave-c-collaboration-contract.md`:

| Step | Rule | Planned evidence |
| ---- | ---- | ---------------- |
| C.1 | COL1 | Two-peer: remote edit arrives as `origin: "collaborator"`, stays out of the local undo stack, and does not fire local-edit paths |
| C.2 | COL2 | Hostile presence (oversize, wrong type, script-bearing, nonexistent block) does not break rendering |
| C.3 | COL3 | Attribution uses the host resolver (or an opaque client handle), never a peer-asserted name as verified identity |
| C.4 | COL4 | Two-peer harness; concurrent split/move/cycle/list/table rows converge; cycles break deterministically |

**In-tree today** (not a substitute for that plan):

- `src/__tests__/conflictResolution.test.ts` — concurrent text insertion, prop last-writer-wins, delete-versus-edit, reorder-with-repair, unknown block type preserved across a fork
- DUR3 passthrough on `@input/pen-schema-default` `createDefaultSchema` and on core's empty registry (`createEmptySchema`)
- Transport grade statements in `@input/pen-transport-sse` and `@input/pen-transport-direct` READMEs (COL6)

**Not in-tree:** the two-peer harness in `@input/pen-test`, the COL4 matrix, hostile-presence conformance, and the COL1 two-client origin suite. `@input/pen-conformance` is not a green scenario pack for these rows.
