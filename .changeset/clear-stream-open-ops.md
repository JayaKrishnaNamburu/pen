---
"@input/pen-document-ops": patch
---

Include `stream-open` in the DocumentOp type table so payload validation stays exhaustive after the Wave 2 stream writer, and reject it as a tool payload — it is the synthetic ST1 open op, not a durable mutation.
