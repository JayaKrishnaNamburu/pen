---
"@input/pen-ai-tools": patch
---

Add AIB3 classification probes for tool authority.

The grant and op meter already have a hostile-model suite. These tests pin how a tool is classified as mutating in the first place: exact catalog names, case/whitespace/confusable near-misses, and an explicit `mutating` declaration. A handler that lies about being read-only still has its `editor.apply` calls metered; the declaration itself is treated as a host signal, not something the model can set.
