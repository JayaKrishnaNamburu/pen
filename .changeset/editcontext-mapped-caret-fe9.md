---
"@input/pen-dom": patch
---

Sync the EditContext caret after a programmatic apply and drop leftover `edit-context-textupdate` authority (FE9), so the next keystroke inserts at the remapped offset instead of clamping or landing in the wrong place.
