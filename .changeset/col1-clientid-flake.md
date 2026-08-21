---
"@input/pen-crdt-yjs": patch
---

Pin peer client ids in the COL1 remote-origin test so concurrent inserts merge deterministically.

Two peers inserted at offset 0 of the same paragraph and the test asserted one concatenation order. Yjs breaks that tie by client id, which `createYjsDocument` generates randomly, so the assertion held only when the ids happened to sort the expected way — measured at two failures in eight runs. The peers now take fixed ids and the suite is green across twelve consecutive runs.
