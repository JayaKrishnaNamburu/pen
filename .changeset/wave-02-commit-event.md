---
"@input/pen-core": patch
"@input/pen-types": patch
"@input/pen-crdt-yjs": patch
"@input/pen-ai": patch
---

Emit `CommitEvent` on `editor.on("commit")` and `Extension.observe`, keep `change` / `documentCommit` as one-release adapters with `event-deprecated`, and delete the Yjs `reconstructOps` path. Remote observer events now report `ops: []`; effect data lives on `event.summary`.
