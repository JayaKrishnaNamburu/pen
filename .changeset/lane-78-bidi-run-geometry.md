---
"@input/pen-dom": patch
---

Populate LineBox.runs from computeBidiRuns so mixed-direction rangeRects are disjoint per-run boxes.

attachBidiRunsToLines no longer emits the Wave 3 spanning placeholder. Run levels come from the in-tree UAX#9 resolver; each run is measured (or split across the line box when measure is unavailable) in visual order.
