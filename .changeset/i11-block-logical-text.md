---
"@input/pen-core": patch
"@input/pen-interop": patch
"@input/pen-markdown-serialization": patch
---

Add a core logical-text API so empty-block storage sentinels stay out of export.

Empty blocks now export as empty text. A zero-width space the user typed is left alone.
