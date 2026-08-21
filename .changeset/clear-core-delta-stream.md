---
"@input/pen-core": patch
"@input/pen-delta-stream": patch
---

Stop core depending on the delta-stream extension.

Streamed-generation undo coverage now lives with the extension and registers it explicitly, so the package graph no longer cycles through that inverted edge.
