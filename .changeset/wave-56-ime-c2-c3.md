---
"@input/pen-dom": patch
---

Defer EditContext DOM writes while composing, and reconcile contenteditable compositionend in the same turn.

A mid-composition remote no longer calls applyDeltaToDOM on the EditContext path — Chromium CDP never fires compositionstart, so textformatupdate opens the composing session. compositionend no longer waits on a 50ms wall-clock gate or a rAF; it applies once the field already has the committed text, or on the next mutation / compositionstart if Safari fires end first.
