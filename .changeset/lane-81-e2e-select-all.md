---
---

Seed the select-all playground e2e document through `editor.apply` so WebKit and Firefox are not asked to build three paragraphs with `type` plus `Enter`. The assertion stays on a real Cmd+A. History caret snapshots ignore the empty-block sentinel so a collapsed caret at offset 0 is not reported as 1.
