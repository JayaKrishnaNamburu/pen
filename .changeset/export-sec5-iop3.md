---
"@input/pen-interop": patch
---

Escape exporter markup and publish per-format fidelity tables.

HTML and XML now serialize document text and attributes through an escaping helper (`&<>"'`), and each export package commits an IOP3 fidelity table generated from tests. Schema-level `toHTML` interpolations stay deferred.
