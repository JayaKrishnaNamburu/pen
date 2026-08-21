---
"@input/pen-document-ops": patch
---

Emit a diagnostic and refuse the whole batch when a mutating document tool is pointed at a missing block, a hidden type, an empty write, or a text offset past the end of the live block.
