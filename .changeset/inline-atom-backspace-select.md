---
"@input/pen-core": minor
"@input/pen-dom": patch
---

Select an adjacent inline atom on the first Backspace or Delete, then delete it on the second press.

`pen.deleteBackward` / `pen.deleteForward` now match Arrow keys and the
v1 `applyDeleteBehavior` product: first press selects the atom, second
press removes it through ordinary selection-delete.
