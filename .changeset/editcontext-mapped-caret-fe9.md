---
"@input/pen-dom": patch
---

On A5 mapped `selectionChange` after `editor.apply`, drop leftover `edit-context-textupdate` authority and project the remapped caret into EditContext (FE9), so the next keystroke inserts at the remapped offset instead of clamping or landing in the wrong place.
