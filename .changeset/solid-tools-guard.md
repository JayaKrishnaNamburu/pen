---
"@input/pen-document-ops": patch
---

Validate document tool payloads before applying ops.

Tool-built ops are checked for a known DocumentOp type, resolved targets, and a 1MB text-field cap. Invalid batches emit diagnostics and do not apply.
