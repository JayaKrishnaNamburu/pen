---
"@input/pen-react": patch
---

Import field-editor helpers from `@input/pen-dom` instead of a local shim directory.

React no longer re-exports twenty-six one-line aliases under `src/field-editor/`. Public helpers come from the curated `@input/pen-dom/field-editor` barrel; runtime pieces that barrel does not export still use the published `./field-editor/*` subpath.
