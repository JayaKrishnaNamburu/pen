---
"@input/pen-dom": patch
---

Collapse programmatic selection stamps onto `authority.record` and delete peek/restore.

The three stamp copies, the intent epoch, and session-switch peek/restore are gone. Leftover-on-other-block ignore and programmatic input-range resolution now read the record. `beginPointerSelection` / `endPointerSelection` stay as pointer-window openers; the depth counter is deleted.
