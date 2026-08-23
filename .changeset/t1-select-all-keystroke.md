---
"@input/pen-dom": minor
---

Wire the T1 select-all ladder onto the Mod-a keystroke.

`handleSelectAllShortcut` now calls `editor.selectAll()` instead of the
document-first `FieldEditorImpl.selectAll` path. First Mod-a selects the
current block; the next press escalates to `BlockSelection`. Backspace after
two presses deletes every top-level block.
