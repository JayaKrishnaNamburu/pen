---
"@input/pen-dom": patch
---

Project a newer selection record in the same turn as `selectionChange`.

The live DOM caret is written before any later input handler runs, so `resolveProgrammaticInputRange` and its facade pass-throughs are deleted. A virtualized unmount parks silently; `selection-target-unmounted` is emitted at most once when the target is present but projection still fails.
