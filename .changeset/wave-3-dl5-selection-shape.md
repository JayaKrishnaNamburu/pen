---
"@input/pen-types": minor
"@input/pen-core": minor
"@input/pen-vue": minor
---

Remove v1 computed fields from live `SelectionState` (breaking). `isCollapsed`, `isMultiBlock`, `blockRange`, and `toRange()` are helpers on `@input/pen-core`; `stampTextSelection` is `createTextSelection`; `getTrustedSelectionBlockRange` merges into `getSelectionBlockRange`.
