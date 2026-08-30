---
"@input/pen-core": patch
"@input/pen-dom": patch
"@input/pen": patch
---

Cut and image drop close the undo capture window the same way paste already does. `clipboardFacet` now merges paste-importer tables (last-wins per key) so multiple providers compose, and the starter HTML clipboard contributes through that facet instead of `assignSlot`.
