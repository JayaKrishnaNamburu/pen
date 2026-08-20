---
"@input/pen-core": patch
---

Stop spreading raw insert-inline-node props into CRDT writes.

`insertInlineNode` now copies validated fields onto a fresh record and drops ops whose props own `__proto__`, `constructor`, or `prototype`, emitting a diagnostic instead of writing.
