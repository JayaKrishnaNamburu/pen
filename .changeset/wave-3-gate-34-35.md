---
"@input/pen-types": minor
"@input/pen-core": minor
"@input/pen-dom": minor
"@input/pen-test": patch
---

Remove `block-converted` from change summaries and delete the unused `PointMapMode` mapping-mode types. A conversion is now `block-props-changed` with `"type"` in keys; the `map*` methods stay but no longer take a mode.
