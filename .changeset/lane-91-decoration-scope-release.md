---
"@input/pen-core": patch
---

Scope decoration recomputes to the affected blocks and release the block index on destroy.

A one-block update now keeps untouched `forBlock` arrays by identity and skips a full index rebuild. `releaseDecorationSet` empties those arrays in place so a retained handle cannot keep decoration entries alive.
