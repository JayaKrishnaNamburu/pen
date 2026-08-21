---
"@input/pen-types": patch
---

Document every PenPersistence member as called or host-implemented.

Thin "Pen never calls this" remarks on the update-log members did not state when a host invokes them, what they may reject with, or what failure means. Those remarks now do. A type-level test locks the eight-member surface so a later signature change fails.
