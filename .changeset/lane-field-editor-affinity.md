---
"@input/pen-dom": patch
---

Keep table-cell caret restore on the cell path when a programmatic stamp names a different cell.

A stamp must address the active cell before it is ranked. An unaddressable stamp no longer falls through to block-level `editorSelectionToDOM`.
