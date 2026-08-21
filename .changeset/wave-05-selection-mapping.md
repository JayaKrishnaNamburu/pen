---
"@input/pen-dom": patch
---

Move DOM↔editor selection mapping (`domPointToOffset`, `getBlockBoundaryPoint`, `domSelectionToEditor`) into `selectionMapping` so Wave 05 can delete `selectionBridge` later without rewriting hosts.

`@input/pen-dom/field-editor/selectionBridge` re-exports the moved names, so the published subpath stays the same. Import from that path until step 5.6.
