---
"@input/pen-react": patch
---

Stop React primitives from logging missing-context failures to console.

Those sites already throw, and there is no editor to emit a diagnostic. The thrown error keeps the wrap hint. Unknown-block fallback still renders in the document instead of warning on the console.
