---
"@input/pen-crdt-yjs": patch
---

Pin Yjs peer client ids in conflict-resolution tests so concurrent merges assert a deterministic order.

Yjs breaks ties between concurrent inserts at the same position by client id, and last-writer-wins map keys by the higher client id. These tests created peers through `createYjsDocument` / `forkDocument` (random ids) and only checked convergence, so a wrong merge would still pass. Peers now take fixed ids and the suite asserts the exact results.
