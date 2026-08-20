---
"@input/pen-types": patch
"@input/pen-crdt-yjs": patch
---

Report document size on load and mark host-owned persistence hooks.

`loadDocument` emits a `document-size` diagnostic when the encoded document meets a stated byte threshold, carrying size, block count, and whether GC is enabled. `PenPersistence` members that Pen never calls are documented as host-implemented.
