---
"@input/pen-dom": patch
---

Add computeBidiRuns for editor-scoped UAX#9 run resolution.

Pen-dom now exposes a pure BR1/BR2 bidi module so later geometry can consume embedding levels and atom-bounded runs without a new Unicode dependency.
