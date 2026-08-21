---
"@input/pen-crdt-yjs": patch
---

Record document-size growth across 10k edit/delete cycles as a reported trend.

DUR6 requires a soak that samples encoded byte size, block count, and `gc` across that workload without treating the numbers as a pass/fail budget. The diagnostic-threshold and cadence tests already exist; this adds the missing soak.
