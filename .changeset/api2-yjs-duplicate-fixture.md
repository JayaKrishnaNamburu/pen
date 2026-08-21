---
"@input/pen-crdt-yjs": patch
---

Add a same-version `yjs-duplicate` (`npm:yjs@13.6.29`) devDependency so API2 can try a real second `Y.Doc` constructor. Under pnpm the alias resolves to the existing store copy, so the suite records that collapse instead of treating the alias as a second module.
