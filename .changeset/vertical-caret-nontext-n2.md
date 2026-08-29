---
"@input/pen-core": patch
---

Escalate a geometry-path vertical caret that lands on a non-text block to `BlockSelection`, matching the logical `crossBlock` path and N2. Hosts whose `setVerticalCaretMeasure` mapped the next line onto a textless block previously got a collapsed text caret there (`anchor-target-missing`, DOM focus on `document.body`). A measured collapsed caret on a table stays a text point so table autocomplete stays enabled. An existing host now receives a `BlockSelection` where this path previously wrote a collapsed text caret. Downstream composers that kept a window-level Enter listener alive only because this path left focus on `document.body` can drop that workaround after they bump. Kept as `patch` so the 0.1.x train stays on `0.1.5`.
