# PenPersistence disposition

Wave V leftover (API10 / DUR6). Every `PenPersistence` member is either called by Pen or marked host-implemented. None are unused.

**Implemented** means Pen has a runtime caller. The host still supplies the storage. **Host-implemented** means Pen never calls the member. Test doubles in `@input/pen-history` and `@input/pen-react` implement the full interface; they are not a Pen persistence implementation.

Types live in `persistence.ts`. This file does not change them.

| Member | Status | Remark |
| --- | --- | --- |
| `loadDocument` | host-implemented | Pen never calls it. Hosts persist and reload Yjs bytes. Pen's load path is `CRDTAdapter.loadDocument` / `Editor.loadDocument`, not this member. |
| `saveSnapshot` | host-implemented | Pen never calls it. Hosts persist a full encoded document state. |
| `appendUpdate` | host-implemented | Pen never calls it. Hosts append a Yjs update to an update log. |
| `getUpdates` | host-implemented | Pen never calls it. Hosts read the update log. |
| `compact` | host-implemented | Pen never calls it. Compaction is host storage: `Y.mergeUpdates` folds an update log, not tombstones. Snapshot retention and `gc: true` are separate tradeoffs — see `@input/pen-crdt-yjs` compaction notes. |
| `saveVersionSnapshot` | implemented | Called by `@input/pen-history` `SnapshotManager.createSnapshot`. |
| `listVersions` | implemented | Called by `SnapshotManager.createSnapshot` (latest entry after write) and `SnapshotManager.listSnapshots`. There is no `getVersionSnapshots`. |
| `loadVersion` | implemented | Called by `SnapshotManager.restoreSnapshot`. |
