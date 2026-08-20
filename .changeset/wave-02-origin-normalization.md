---
"@input/pen-crdt-yjs": patch
---

Normalize every Y transaction to a structured origin: `applyUpdate` stamps `{ type: "collaborator" }`, `transact` wraps string origins, and unknown tags become `{ type: "system", source }` with an `ORIGIN_UNKNOWN` diagnostic.
