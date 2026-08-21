---
"@input/pen-dom": patch
---

Add a standalone GeometryReader for caret, range, and line-box measurement.

Wave 3.2 lands `caretRect`, `rangeRects`, `lineBoxes`, `pointAt`, `blockRect`, and `verticalCaretTarget` (G1–G5) in `@input/pen-dom`. Each editor root pairs the reader with a `DomScheduler`; overlay and menu code read it through `measureWithRoot`.
