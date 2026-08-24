---
"@input/pen-types": minor
"@input/pen-core": minor
"@input/pen-crdt-yjs": minor
"@input/pen-dom": minor
"@input/pen-react": minor
"@input/pen-ai": minor
"@input/pen-interop": minor
"@input/pen-markdown-serialization": minor
"@input/pen-test": minor
---

Empty text-capable blocks store `""` (EM1). Stamp-2 documents migrate on load (EM3) and stamp-2 remotes heal the lone `"\u200B"` form only (EM4); embedded ZWSP in longer text is user content. Host-visible empty-block reads (`data-offset`, field `textContent`, `extractTextFromDOM`, `textDeltas()`) are now `0` / `""` / `[]`. `EMPTY_BLOCK_SENTINEL`, `logicalTextFromStored`, and `INLINE_ATOM_CARET_BOUNDARY_TEXT` are deleted. `PEN_DOCUMENT_FORMAT` is 3.
