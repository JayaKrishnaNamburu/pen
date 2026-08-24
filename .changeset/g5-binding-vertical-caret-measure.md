---
"@input/pen-react": patch
"@input/pen-vue": patch
---

Register the G5 vertical caret measure in the React and Vue bindings so ArrowUp / ArrowDown move the caret mid-paragraph.

Both bindings construct `FieldEditorImpl` themselves rather than going through `mountEditor`, and neither called `registerVerticalCaretMeasure`. Without it `pen.caretUp` / `pen.caretDown` were a handled no-op mid-block, emitting `caret-geometry-unavailable`, so vertical caret motion was inert in every React and Vue host. `EditorRoot` now registers the measure in an effect keyed on the root element, and `PenEditor` registers it in its root-element watcher; both release it on unmount.
