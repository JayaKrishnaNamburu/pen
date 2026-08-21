---
"@input/pen-dom": patch
---

Fix GeometryReader follower-cache invalidation and empty-block pointAt offsets.

A commit that changes one block's height no longer leaves following blocks with a stale Y: `invalidateBlocks` drops named blocks and any cached neighbor whose live box moved, and `pointAt` converts caret-from-point hits through `offsetDomain` so the empty-block sentinel is not a logical offset.
