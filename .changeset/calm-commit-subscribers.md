---
"@input/pen-dom": patch
"@input/pen-search": patch
"@input/pen-history": patch
"@input/pen-react": patch
"@input/pen-vue": patch
"@input/pen-bench": patch
---

Move session reconcile, search, history snapshots, and React/Vue document-refresh hooks onto `commit`.

The DOM session reconciler now treats undo/redo via `getOpOriginType` so structured `{ type: "history" }` origins reconcile the focus block. Affected-block hooks read `event.summary` instead of adapter `affectedBlocks`.
