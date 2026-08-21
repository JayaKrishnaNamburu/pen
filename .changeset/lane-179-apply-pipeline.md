---
"@input/pen-core": patch
---

Keep structured apply origins on the Y transaction, drop throwing or non-array `onBeforeApply` returns with a diagnostic, attach apply diagnostics to the `CommitEvent`, and include nested children in `editor.blocks()` and `editor.blockCount()`.
