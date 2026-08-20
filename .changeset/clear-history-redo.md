---
"@input/pen-crdt-yjs": patch
---

Tag Y.UndoManager redo transactions as `{ type: "history", source: "redo" }` so commit events can distinguish redo from undo.
