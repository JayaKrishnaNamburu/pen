---
"@input/pen-undo": patch
"@input/pen-crdt-yjs": patch
"@input/pen-types": patch
---

Cap the undo stack at 500 items and destroy the Yjs undo manager on deactivate.

Y.UndoManager has no native depth limit, so long sessions and streaming AI writes grew history without bound. Oldest stack items are now trimmed past the cap, and deactivating the undo extension releases the manager's document listeners.
