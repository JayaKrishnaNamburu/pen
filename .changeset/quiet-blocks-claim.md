---
"@input/pen-core": patch
---

Fix silent content loss when an `insert-block` op names a block that already exists.

Applying `insert-block` with a live block's id replaced that block's text, props, and meta with empty ones, emitted no diagnostic, and left a document that looked structurally intact. Reproduced on a paragraph holding `"user content"` with `origin: "user"`: after the second insert the block read `""` and its props were `{}`, with zero diagnostics.

Three things combined to make it silent. Validate's block-existence guard explicitly exempts `insert-block`, since an insert is the one op whose target is expected not to exist yet. The executor then calls `initBlockMap`, which builds a fresh block map and sets it unconditionally rather than checking for an occupant. Normalization's duplicate-order rule finally stripped the second `blockOrder` entry, removing the only externally visible trace.

Validate now claims a block id once per document: an `insert-block` whose id is already live, or already pending earlier in the same batch, is dropped with `diagnostic { code: "PEN_APPLY_010" }` and the existing block keeps its content. Pending-insert validation is unchanged, so a later op in the same batch may still target a block being inserted (`spec/rules/pipeline.md` PR3).

The tool surfaces were not exposed and are unchanged: `edit_document`'s `insert_blocks` takes markdown plus a placement, and the standalone `insert_block` tool mints its own id, so a model cannot name the id of a block it inserts. The reachable callers were host code choosing its own ids and a `block-insert` stream part, where a server names the id — which is how this surfaced, since a transport that re-delivers one part destroyed a block. `@input/pen-tools` payload validation still accepts an `insert-block` naming a live block; apply is now the backstop that refuses it.
