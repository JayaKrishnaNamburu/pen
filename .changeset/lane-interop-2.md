---
"@input/pen-schema-default": patch
"@input/pen-content-ops": patch
"@input/pen-import-markdown": patch
"@input/pen-export-xml": patch
---

Keep details and callout body children on markdown import, and treat mixed-case href/src as URL fields on XML export.

Compact `<details>` leftover HTML and split `</details>` siblings become toggle children; extra blockquote paragraphs become callout children. XML export decides URL admission on the key case-insensitively. `INGEST_TIME_BUDGET_MS` stays advisory — the suite pins cap-before-parse, not a clock.
