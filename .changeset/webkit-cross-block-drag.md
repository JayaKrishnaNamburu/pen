---
"@input/pen-dom": patch
---

Fix cross-block pointer drags on WebKit. Releasing a field editor assigned `contentEditable = "false"`, which is indistinguishable from absent while the surface is single-field but becomes a read-only island once the surface expands and the blocks host becomes the editing host. WebKit clamps a selection at the boundary of such an island, so a drag starting in that field never reached the next block. Both contenteditable backends now remove the attribute instead.

The single-field leftover predicate is generalised (`isSingleFieldNativeLeftover`) and applied on the accept path as well: when a drag ends on a structural block with no text position, such as a divider, no engine can put a range endpoint there and the nearest text end must not overwrite the structural cover.
