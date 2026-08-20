---
"@input/pen-types": patch
"@input/pen-core": patch
"@input/pen-crdt-yjs": patch
---

Add a document migration runner with an applied-id ledger.

`runMigrations` applies host-supplied upgrades through `createHeadlessEditor` or a browser editor, records ids under reserved `metadata.penMigrations`, and uses the `migration` origin so undo does not roll back a document upgrade. A throwing migration isolates its own ops and does not stop the rest of the list.
