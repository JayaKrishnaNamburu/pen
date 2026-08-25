---
"@input/pen-ai": patch
---

Stream `edit_document` partial tool input into a withdrawable preview (EC15) and set per-pass `toolChoice` when the adapter reports `forcedToolChoice` (EC17). `editor.apply` still sees only a complete, validated batch.
