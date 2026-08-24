---
"@input/pen-ai": patch
---

Lock 1000 streamed `gen-delta` appends to one `editor.apply` per flush window so the path cannot regress to a commit per token.
