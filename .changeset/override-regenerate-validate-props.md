---
"@input/pen-core": patch
---

Regenerate `validateProps` from the merged `propSchema` when `override()` adds props without an explicit validator, so apply no longer strips the new props.
