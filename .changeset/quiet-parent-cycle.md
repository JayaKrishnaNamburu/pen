---
"@input/pen-core": patch
---

Break concurrent parent cycles in normalize by clearing the edge owned by the lowest block id, and emit a parent-cycle diagnostic so peers repair the same way.
