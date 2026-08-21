---
"@input/pen-dom": patch
---

Add a per-root DOM scheduler and a cached GeometryReader.

`DomScheduler` splits each flush into a read phase then a write phase (I9), counts `measureNow`, and emits `read-after-write` when a write-phase read forces the next frame. `GeometryReader` returns caret, range, line-box, and hit-test data with a per-block cache. Neither module is wired to apply, overlays, or the React/Vue bindings yet.
