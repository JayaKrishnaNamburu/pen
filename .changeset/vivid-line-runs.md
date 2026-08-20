---
"@input/pen-dom": patch
---

Populate GeometryReader LineBox.runs from computeBidiRuns so mixed-direction lines expose visual-order BidiRunGeometry.

Per-run rects in jsdom split the line box by run length. Browser 1px agreement with native selection rects is deferred to the conformance harness.
