---
"@input/pen-types": minor
"@input/pen-core": minor
"@input/pen-crdt-yjs": minor
"@input/pen-document-ops": minor
"@input/pen-ai": minor
"@input/pen-undo": minor
---

Slim `DocumentOp` from thirty variants to the ten primitives. Split and merge become command recipes that still stamp `tagStructuralOrigin` in the same transaction; deleted names are not a host compatibility layer.
