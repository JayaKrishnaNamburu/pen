---
"@input/pen-core": patch
---

Move the Wave 4.2 structure, table, and history command handlers into `@input/pen-core`.

Block move/duplicate/delete, cell Tab/Enter navigation, and undo/redo now dispatch headlessly. Vertical caret handlers stay deferred until a geometry seam exists on command context.
