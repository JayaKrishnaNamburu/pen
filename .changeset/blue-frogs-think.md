---
"@input/pen-content-ops": patch
"@input/pen-core": patch
"@input/pen-export-json": patch
"@input/pen-export-xml": patch
"@input/pen-react": patch
"@input/pen-search": patch
"@input/pen-types": patch
---

Improve document fidelity and in-editor search for richer content.

Inline node segments now round-trip through the shared content pipeline and the JSON/XML exporters, and search now covers table and database cells with matching React search primitives for the updated extension behavior.
