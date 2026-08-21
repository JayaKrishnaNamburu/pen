---
"@input/pen-ai": patch
"@input/pen-react": patch
---

Stop re-exporting slot-key constants from `@input/pen-ai`, and stop re-exporting most field-editor engine helpers from the `@input/pen-react` root.

Plan types and validation helpers remain on the AI barrel. `fullReconcileDeltasToDOM` stays on the React root because it is not on the `@input/pen-dom/field-editor` subpath; other engine helpers move there.
