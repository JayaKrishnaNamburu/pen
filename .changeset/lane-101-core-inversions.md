---
"@input/pen-core": patch
"@input/pen-content-ops": patch
"@input/pen-markdown-serialization": patch
---

Move `blocksToOps`, profile-policy helpers, `getNumberedListItemValue`, `buildTableChildren`, and `sortDeltaAttributes` into `@input/pen-core` so core no longer depends on those feature packages. Both packages still export the same symbols.
