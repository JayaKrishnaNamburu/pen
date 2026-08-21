---
"@input/pen-core": patch
"@input/pen-dom": patch
---

Wire the Wave 05 snap rule as reading step 3.

`@input/pen-core` now exports `snapToNormalPosition`, `NormalPositionSnapshot`, `buildNormalPositionSnapshot`, and `getEditorSelectionRecord` (`editor.selectionRecord` on the runtime editor) so pen-dom does not grow a second snap adapter. The three field-editor backends stop on a logically equivalent DOM read and otherwise keep the v1 heuristics, including the leftover select-all ignore.
