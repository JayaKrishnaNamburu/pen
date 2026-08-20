---
"@input/pen-export-html": patch
"@input/pen-export-xml": patch
"@input/pen-export-markdown": patch
"@input/pen-export-json": patch
---

Escape exporter markup and publish per-format fidelity tables.

HTML and XML now serialize document text and attributes through an escaping helper (`&<>"'`), and each export package commits an IOP3 fidelity table generated from tests. Schema-level `toHTML` interpolations stay deferred.
