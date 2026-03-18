---
"@pen/content-ops": patch
"@pen/core": patch
"@pen/export-json": patch
"@pen/export-xml": patch
"@pen/react": patch
"@pen/search": patch
"@pen/types": patch
---

Improve document fidelity and in-editor search for richer content.

Inline node segments now round-trip through the shared content pipeline and the JSON/XML exporters, and search now covers table and database cells with matching React search primitives for the updated extension behavior.
