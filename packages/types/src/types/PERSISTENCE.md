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
