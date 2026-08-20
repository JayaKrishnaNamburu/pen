---
"@input/pen-crdt-yjs": patch
---

Label remote CRDT updates as collaborator instead of user.

Unlabeled `applyUpdate` transactions now map to `collaborator`, and absent or unrecognized local origins map to `unknown`, so `"user"` is only used for origins Pen itself set.
