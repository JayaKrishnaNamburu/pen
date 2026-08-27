# Mutation Pipeline

## Purpose

Capture the mutation rules that keep editor behavior predictable across packages.

## Canonical Path

`DocumentOp[]` is the mutation currency. The union is closed at ten variants: `splice-text`, `format-text`, `insert-block`, `delete-block`, `move-block`, `set-props`, `set-meta`, `grid`, `app`, `stream-open`. Durable document writes go through `editor.apply(ops, options)`.

Text edits are `splice-text` (`from`/`to` in the pre-op logical domain; `insert` is a string, an inline atom, or an array of those). Attribute-only ranges are `format-text`. Block conversion is `set-props` with `"type"` among the keys. Table geometry is `grid`; app records are `app`. Cell text uses `splice-text` / `format-text` with `cell`.

Split and merge are command recipes, not ops. `pen.splitBlock` emits `insert-block` plus two `splice-text` ops in one apply and stamps `origin.intent: "pen.splitBlock"`. Merge is a side effect of `pen.deleteBackward` / `pen.deleteForward` at a block boundary (`splice-text` append plus `delete-block`); intent is the delete command that was dispatched. The structural outcome travels on the change summary as `block-split` / `blocks-merged`.

## Responsibilities

`@input/pen-core` owns:

- operation validation
- normalization and policy enforcement
- selection updates
- `editor.anchors` mint, resolve, and repair
- change-summary construction
- extension dispatch hooks
- history integration
- `commit` events (`CommitEvent`, with `summary.affectedBlockIds`)

## Design Constraints

- Packages should not bypass the core mutation boundary for document writes.
- Extension hooks should stay deterministic and bounded.
- Importers, tools, AI, and renderers may prepare ops, but `@input/pen-core` remains the authority that applies them.
- Origin tagging matters so undo, diagnostics, and collaboration surfaces can interpret writes correctly. Dispatch stamps `origin.intent` with the command name. Nothing synthesizes intent on remote, undo, or stream commits.
- `editor.apply` sends a structured origin object into `adapter.transact`. `Y.UndoManager` matches tracked origins by identity, so `@input/pen-yjs` wraps the tracked set in a `TrackedOriginSet` that also matches on `origin.type`. Do not copy the origin object at the transact boundary.
- A position that must survive commits is an anchor. Summaries answer what a commit touched; they do not map raw `{ blockId, offset }` across commits.
