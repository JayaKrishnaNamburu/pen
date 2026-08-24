---
"@input/pen-core": minor
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
"@input/pen-crdt-yjs": patch
---

Rename the `pen.readOnly` facet to `pen.ariaReadOnly` so the name matches the only job it does: set `aria-readonly`. The renderer `readonly` prop remains the input gate; neither is a security boundary.
