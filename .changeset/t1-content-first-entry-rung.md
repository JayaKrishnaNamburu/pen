---
"@input/pen-types": minor
"@input/pen-core": minor
"@input/pen-dom": minor
---

Give the T1 select-all ladder a content-first entry rung and let the
interaction model choose it.

`editor.selectAll()` takes an optional `SelectAllBehavior`. With
`"content-first"` (the default `interactionModel`) one Mod-a is a
`TextSelection` covering every block, and the next press escalates to
`BlockSelection`; `"block-first"` still enters at the current block. The rung
stays computed from selection state, so the DOM-layer `FieldEditorImpl.selectAll`
and `SelectAllController` cycle are deleted along with `FieldEditor.selectAll`
and `FieldEditor.resetSelectAllCycle`.

A multi-block `TextSelection` now keeps the field editor's `expanded` surface:
`activateFieldEditorFromSelection` no longer deactivates on multi-block text,
which used to leave the selection visible but untypable.
