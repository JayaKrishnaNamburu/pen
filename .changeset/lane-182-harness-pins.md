---
"@input/pen-test": patch
---

Reject a model-double response that sets both `events` and `error`, so a scripted failure cannot be silently dropped.
