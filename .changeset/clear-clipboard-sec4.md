---
"@input/pen-types": patch
"@input/pen-dom": patch
---

Write the spec clipboard JSON flavor and schema-validate it on paste.

Copy now sets `application/x-pen-blocks+json` (and still writes the older `application/x-pen-blocks` flavor). Paste admits blocks through the same proto-key, schema, and depth/count rules as JSON document import.
