---
"@input/pen-import-markdown": patch
"@input/pen-import-json": patch
---

Bound markdown and JSON import by node count, nesting depth, text size, and image count, and schema-validate JSON before ops.

Exceeding a bound truncates at a block boundary and returns one dropped-by-reason report. JSON ingestion rejects `__proto__`/`constructor`/`prototype` own keys and copies into null-prototype records.
