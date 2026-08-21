---
"@input/pen-dom": patch
---

Export `mountEditor` as the vanilla document-shell entry point.

Installing `FieldEditorImpl` and calling `setRootElement` alone does not build the document tree and renders a blank page. `mountEditor` constructs the field editor, calls `createDocumentTree`, sets the root, and wires focus, pointer activation, and document keydown — the same shell React and Vue already assemble.
