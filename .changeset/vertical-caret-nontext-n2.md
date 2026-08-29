---
"@input/pen-core": minor
---

Escalate a geometry-path vertical caret that lands on a non-text block to `BlockSelection`, matching the logical `crossBlock` path and N2. Hosts whose `setVerticalCaretMeasure` mapped the next line onto a textless block previously got a collapsed text caret there (`anchor-target-missing`, DOM focus on `document.body`). A measured collapsed caret on a table stays a text point so table autocomplete stays enabled. Graded `minor`: an existing host now receives a `BlockSelection` where this path previously wrote a collapsed text caret, which is a selection-outcome break even though it aligns the geometry path with the already-specified `crossBlock` path. Downstream composers that kept a window-level Enter listener alive only because this path left focus on `document.body` can drop that workaround after they bump.
