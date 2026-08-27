# PenPersistence disposition

API10 / DUR6. Every `PenPersistence` member is either called by Pen or marked host-implemented. None are unused.

**Implemented** means Pen has a runtime caller. The host still supplies the storage. **Host-implemented** means Pen never calls the member. Test doubles in `@input/pen-snapshots` and `@input/pen-react` implement the full interface; they are not a Pen persistence implementation.

Types live in `persistence.ts`. This file does not change them.

| Member | Status | Remark |
| --- | --- | --- |
| `loadDocument` | host-implemented | Pen never calls it. Host opens a stored document, then feeds bytes to `CRDTAdapter.loadDocument`. `null` means create a new document. Rejection aborts open. |
| `saveSnapshot` | host-implemented | Pen never calls it. Host persists a full encoded state on its own schedule. Rejection means that full state is not durable. |
| `appendUpdate` | host-implemented | Pen never calls it. Host appends one Yjs update to its log. A dropped append leaves a gap. Full-snapshot hosts may no-op. |
| `getUpdates` | host-implemented | Pen never calls it. Host reads its update log; `since` is a host cursor. Full-snapshot hosts may return `[]`. |
| `compact` | host-implemented | Pen never calls it. Compaction is host storage: `Y.mergeUpdates` folds an update log, not tombstones. Snapshot retention and `gc: true` are separate tradeoffs — see `@input/pen-yjs` compaction notes. A rejected compact leaves the log as stored. |
| `saveVersionSnapshot` | implemented | Called by `@input/pen-snapshots` `SnapshotManager.createSnapshot`. Rejection fails the create. |
| `listVersions` | implemented | Called by `SnapshotManager.createSnapshot` (latest entry after write) and `SnapshotManager.listSnapshots`. Empty list after write synthesizes an entry. There is no `getVersionSnapshots`. |
| `loadVersion` | implemented | Called by `SnapshotManager.restoreSnapshot`. Missing version throws from the manager; rejection fails restore. |

## AssetProvider

| Member | Status | Remark |
| --- | --- | --- |
| `maxSize` | implemented | Read by `uploadImageFiles` and `applyHtmlImageSrcPolicy` before `upload`; forwarded as `AssetUploadOptions.maxSize`. |
| `upload` | implemented | Called by `uploadImageFiles` (paste/drop) and `applyHtmlImageSrcPolicy` when `imageSrc` is `"ingest"`. |
| `resolve` | implemented | Called after a successful `upload` at the same two sites. |
| `delete` | host-implemented | Pen never calls it. Hosts own reference counting; a removed block is not a delete. |

## AssetUploadOptions

| Member | Status | Remark |
| --- | --- | --- |
| `mimeType` | implemented | Forwarded to `upload` at both call sites. |
| `maxSize` | implemented | Enforced before `upload`; forwarded to the provider. Oversize emits `asset-upload-failed` naming the limit and actual size; no image block is inserted. |
| `onProgress` | implemented | Forwarded by `uploadImageFiles` when the host supplies a callback. HTML ingest has no progress hook, so it does not invent one. |
