---
"@input/pen-input-rules": patch
---

Skip input-rule transforms when `onBeforeApply` is invoked again on the ops this extension just produced, so a rule cannot rematch its own insert.
