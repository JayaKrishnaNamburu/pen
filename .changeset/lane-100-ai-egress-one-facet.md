---
"@input/pen-core": patch
"@input/pen-ai": patch
---

Define `pen.aiEgress` once in core and share a single `streamThroughEgress` so generation, suggestions, and autocomplete consult the same deny filter.
