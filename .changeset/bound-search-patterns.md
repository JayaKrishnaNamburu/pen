---
"@input/pen-search": patch
---

Bound search regex compilation and execution to cap ReDoS cost.

User-supplied patterns compile with the `u` flag under try/catch, queries are capped at 1,024 characters, and regex matching stops after a 50ms block-by-block budget with a 64k code-unit segment cap.
