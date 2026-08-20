---
"@input/pen-dom": patch
"@input/pen-react": patch
---

Consolidate renderer `parentIdTree` and `dataAttributes` into `@input/pen-dom`.

React now re-exports both modules so the copies cannot drift. The shared `DATA_ATTRS` map keeps the field-editor caret-boundary attributes and the inline-atom dragging attribute that had split across the two packages.
