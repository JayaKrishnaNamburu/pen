---
"@input/pen-ai": patch
"@input/pen-core": patch
"@input/pen-dom": patch
"@input/pen-types": patch
---

Delete leftover architecture the plan/review teardown left behind: the structured-intent module, the one-adapter registry, write-only `applyPolicy`, `app-partial`, and `AIExecutionMode`. Close generation streaming on the sink instead of re-deriving it, collapse the three suggestion mutation modes at the commit seam, and extract suggestion range mapping so the suggestions controller stays under 1k.
