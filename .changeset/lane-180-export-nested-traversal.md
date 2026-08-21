---
"@input/pen-document-ops": patch
---

Declare mutating and destructive flags on the document-ops tool catalog.

Read-only tools now set `mutating: false` and the write tools set `mutating: true` (delete and write_document also `destructive: true`) so classification matches the handlers instead of depending only on name matching.
