---
"@input/pen-dom": patch
---

Bind a remounted parked selection to that block's field, not the previous one.

A virtualized host remounting the parked target is correct. The contenteditable backend was still holding the old Y.Text and wrote it into the new node, then the mutation watchdog looped on the React restore. Projection now activates the parked block before attach, and the watchdog discards its own writes.
