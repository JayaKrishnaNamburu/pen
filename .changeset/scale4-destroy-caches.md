---
"@input/pen-core": patch
"@input/pen-bench": patch
---

Release the four caches `editor.destroy()` still held after teardown.

Decorations, the summary log, document-state indexes, and the leftover `undo:manager` slot stayed reachable on a destroyed editor, which is the SCALE4 leak the nightly soak is meant to catch. Destroy now drops those four (and the paired change-summary block index); the soak retention inventory asserts each one is gone rather than still present. The undo extension already destroys its manager on deactivate but leaves both the slot map entry and the `undoManagerFacet` override — `getSlot("undo:manager")` is a facet adapter, so core clears both.
