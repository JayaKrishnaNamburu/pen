---
"@input/pen-ai": patch
"@input/pen-react": patch
---

Unexport accidental public surface: planner internals and slot-key re-exports leave `@input/pen-ai`, and field-editor engine helpers leave the `@input/pen-react` root. Extension authors import those helpers from `@input/pen-dom/field-editor`.
