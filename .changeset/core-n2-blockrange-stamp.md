---
"@input/pen-core": minor
---

Stamp command text-selection `blockRange` from the document span, and convert a fully-selected (0..1) non-text text write into `BlockSelection`. Collapsed table carets and mixed-boundary divider endpoints stay on the existing 0..1 clamp.
