/**
 * Host-owned persistence for a Pen document's Yjs bytes and version snapshots.
 *
 * `@input/pen-snapshots` calls the version-snapshot members. The update-log
 * members and {@link PenPersistence.compact} are host-implemented: Pen never
 * calls them (API10). See `PERSISTENCE.md` for the per-member disposition,
 * including {@link AssetProvider} / {@link AssetUploadOptions}.
 */
export interface PenPersistence {
	/**
	 * Load the latest persisted state for `docId`.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `loadDocument`. The host calls this
	 * when it opens a stored document, then feeds the bytes to
	 * `CRDTAdapter.loadDocument` (or `Editor.loadDocument` after adapting).
	 * Return `null` when the host has no bytes for `docId` — the host then
	 * creates a new document with `adapter.createDocument()`. Rejection is
	 * host-defined; Pen is not on the stack and does not catch it. A rejected
	 * load is an aborted open.
	 */
	loadDocument(docId: string): Promise<Uint8Array | null>;
	/**
	 * Persist a full encoded document state.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `saveSnapshot`. The host calls this
	 * on its own schedule (idle, interval, unload) with
	 * `adapter.encodeState` / `Y.encodeStateAsUpdate` bytes. This is a
	 * full-state write, not an incremental update. Rejection is host-defined;
	 * Pen does not catch it. A rejected save means that full state is not
	 * durable — if the host also keeps an update log, that log is the
	 * recovery path.
	 */
	saveSnapshot(docId: string, state: Uint8Array): Promise<void>;
	/**
	 * Append a Yjs update to the document's update log.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `appendUpdate`. The host typically
	 * calls this from a `Y.Doc` update observer after encoding the update.
	 * Rejection is host-defined; Pen does not catch it. A dropped append
	 * leaves a gap in the log, so a later rebuild from `getUpdates` is
	 * incomplete unless the host also has a later `saveSnapshot`. Hosts that
	 * persist only full snapshots may implement this as a no-op.
	 */
	appendUpdate(docId: string, update: Uint8Array): Promise<void>;
	/**
	 * Read updates from the document's update log.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `getUpdates`. The host calls this to
	 * rebuild state or feed a replica. `since` is an opaque cursor the host
	 * defines (often the last persisted update or a state vector); omit it
	 * to read the whole log. Rejection is host-defined; Pen does not catch
	 * it. Hosts that persist only full snapshots may return `[]`.
	 */
	getUpdates(docId: string, since?: Uint8Array): Promise<Uint8Array[]>;
	/**
	 * Compact stored updates for `docId`.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `compact`. The host calls this when
	 * it wants to shrink its own update log. Compaction is a host storage
	 * concern: `Y.mergeUpdates` folds an update log, not tombstones. Snapshot
	 * retention and `gc: true` are separate tradeoffs — see the compaction
	 * notes in `@input/pen-yjs`. Rejection is host-defined; Pen does not
	 * catch it. A rejected compact leaves the log as stored.
	 */
	compact(docId: string): Promise<void>;
	/**
	 * Persist a version snapshot.
	 *
	 * @remarks
	 * Called by `@input/pen-snapshots` `SnapshotManager.createSnapshot`.
	 * If this rejects, `createSnapshot` rejects and no version is listed.
	 * Pen does not catch the rejection; the host chooses the error type.
	 */
	saveVersionSnapshot(
		docId: string,
		snapshot: Uint8Array,
		metadata: VersionMetadata,
	): Promise<void>;
	/**
	 * List version snapshots.
	 *
	 * @remarks
	 * Called by `@input/pen-snapshots` `SnapshotManager.createSnapshot` (latest
	 * entry after write, `{ limit: 1 }`) and `SnapshotManager.listSnapshots`.
	 * If this rejects, the calling method rejects. If `createSnapshot`
	 * receives an empty list after a successful write, it synthesizes an
	 * entry with a fresh id. There is no `getVersionSnapshots`.
	 */
	listVersions(
		docId: string,
		options?: { limit?: number; before?: string },
	): Promise<VersionEntry[]>;
	/**
	 * Load a version snapshot for restore.
	 *
	 * @remarks
	 * Called by `@input/pen-snapshots` `SnapshotManager.restoreSnapshot`.
	 * Restore uses the returned `snapshot` bytes. A missing version throws
	 * `Snapshot ${versionId} not found` from the manager. If this rejects,
	 * restore rejects. Pen does not catch the rejection.
	 * Listing is {@link PenPersistence.listVersions}.
	 */
	loadVersion(
		docId: string,
		versionId: string,
	): Promise<{ state: Uint8Array; snapshot: Uint8Array }>;
}

export interface VersionMetadata {
	label?: string;
	trigger: "auto" | "manual" | "ai-generation" | "import";
	clientId: number;
	timestamp: number;
}

export interface VersionEntry {
	id: string;
	metadata: VersionMetadata;
	createdAt: number;
}

export interface AssetRef {
	id: string;
	url: string;
	mimeType: string;
	size: number;
}

export interface AssetUploadOptions {
	mimeType?: string;
	/**
	 * Maximum accepted size in bytes. Pen enforces this before calling
	 * {@link AssetProvider.upload} and forwards the same limit to the provider.
	 * Oversize files emit `asset-upload-failed` naming this limit and the actual
	 * size; they are not uploaded and produce no image block.
	 */
	maxSize?: number;
	/**
	 * Upload progress in the range `[0, 1]`. Pen forwards this callback to
	 * {@link AssetProvider.upload}; the provider invokes it during the upload.
	 */
	onProgress?: (progress: number) => void;
}

export interface AssetProvider {
	/**
	 * Host-declared maximum upload size in bytes.
	 *
	 * @remarks
	 * Read by `@input/pen-dom` `uploadImageFiles` and
	 * `@input/pen-interop/html` `applyHtmlImageSrcPolicy` before `upload`.
	 * The same limit is forwarded as {@link AssetUploadOptions.maxSize}.
	 */
	readonly maxSize?: number;
	/**
	 * Store `file` and return a durable ref.
	 *
	 * @remarks
	 * Called by `@input/pen-dom` `uploadImageFiles` (paste/drop) and
	 * `@input/pen-interop/html` `applyHtmlImageSrcPolicy` when `imageSrc` is
	 * `"ingest"`.
	 */
	upload(file: File | Blob, options?: AssetUploadOptions): Promise<AssetRef>;
	/**
	 * Return a URL the renderer can use for `ref`.
	 *
	 * @remarks
	 * Called after a successful `upload` at the same two sites.
	 */
	resolve(ref: AssetRef): string;
	/**
	 * Remove an asset from host storage.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `delete`. Pen cannot know whether a
	 * removed block's asset is still referenced by another document, a version
	 * snapshot, or a collaborator's pending undo. Hosts own reference counting
	 * and should call `delete` only when their count reaches zero.
	 */
	delete(ref: AssetRef): Promise<void>;
}
