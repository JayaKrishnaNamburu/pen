---
"@input/pen-types": patch
"@input/pen-crdt-yjs": patch
"@input/pen-core": patch
"@input/pen-history": patch
---

Write a format stamp on every new document and resolve load into ok, repaired, or unreadable.

Unstamped v1 documents read as format 1 and are stamped on the first write of a session. Load repairs duplicate order and orphans by default, names each repair, and throws `PenDocumentUnreadableError` when `minReader` is too new or a shared type has the wrong Yjs constructor.
