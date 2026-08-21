---
"@input/pen-undo": patch
---

Add behavioral undo tests against a real Yjs document so restore, grouping, origin filtering, depth, and destroy are asserted by document state rather than mock return values.

`destroy()` now makes the manager inert: a later `undo()` / `redo()` returns false and does not mutate the document. Yjs still allows `undo()` after `Y.UndoManager.destroy()`, so the previous teardown only dropped listeners.
