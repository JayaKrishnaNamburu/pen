---
"@input/pen-dom": patch
---

Replace the per-frame `applyBackendSelectionUntilNextFrame` rAF mute with a same-turn `withBackendSelectionWrite` window.

Backend selection writes mute `selectionchange` only while the write runs, then release before return. `applySelectionUntilNextFrame` and its `requestAnimationFrame` are deleted. `selectionAuthority.ts` stays: the stamp map and write-depth still have live jobs.
