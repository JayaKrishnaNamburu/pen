---
"@input/pen-dom": patch
---

Add a standalone per-root DOM read/write scheduler.

`DomScheduler` batches reads and writes into one animation-frame flush, counts `measureNow` calls, and emits `read-after-write` when a write-phase read forces the next frame. Each editor root gets a scheduler paired with its GeometryReader.
