---
"@input/pen-dom": patch
---

Add the offset-domain sentinel seam for selection mapping.

`toDomOffset` and `toLogicalOffset` translate between logical caret offsets and stored DOM offsets so the empty-block zero-width space stays a storage detail, not a logical character.
