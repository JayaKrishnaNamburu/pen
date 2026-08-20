---
"@input/pen-core": patch
"@input/pen-document-ops": patch
---

Reject prototype keys on every apply-time op and tool payload.

Phase 2 drops ops whose records carry `__proto__`, `constructor`, or `prototype` own keys. Document-ops refuses the same keys before apply.
