---
"@input/pen-core": patch
"@input/pen-crdt-yjs": patch
---

Report document size on a post-load cadence and keep unknown-type passthrough when schemas merge.

After `loadDocument`, a later write may emit `document-size` again only when the wall-clock interval has elapsed. `mergeSchemas` now defaults `onUnknownBlock` to passthrough so composed registries keep existing unknown content.
