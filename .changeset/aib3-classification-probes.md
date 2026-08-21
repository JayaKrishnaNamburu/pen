---
"@input/pen-ai-tools": patch
---

Add AIB3 classification probes for tool authority.

The grant and op meter already have a hostile-model suite. These tests pin how a tool is classified as mutating in the first place: exact catalog names, case/whitespace/confusable near-misses, and an explicit `mutating` declaration. Classification is a grant signal only — a handler that then calls `editor.apply` is refused at the apply wrap, not trusted because of its name or `mutating: false`.
