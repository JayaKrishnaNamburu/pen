/**
 * Host-owned persistence for a Pen document's Yjs bytes and version snapshots.
 *
 * `@input/pen-history` calls the version-snapshot members. The update-log
 * members and {@link PenPersistence.compact} are host-implemented: Pen never
 * calls them (API10). See `PERSISTENCE.md` for the per-member disposition,
 * including {@link AssetProvider} / {@link AssetUploadOptions}.
 */
export interface PenPersistence {
	/**
	 * Load the latest persisted state for `docId`.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `loadDocument`. Hosts persist and reload
	 * Yjs bytes; Pen's load path is `CRDTAdapter.loadDocument`.
	 */
	loadDocument(docId: string): Promise<Uint8Array | null>;
	/**
	 * Persist a full encoded document state.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `saveSnapshot`.
	 */
	saveSnapshot(docId: string, state: Uint8Array): Promise<void>;
	/**
	 * Append a Yjs update to the document's update log.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `appendUpdate`.
	 */
	appendUpdate(docId: string, update: Uint8Array): Promise<void>;
	/**
	 * Read updates from the document's update log.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `getUpdates`.
	 */
	getUpdates(docId: string, since?: Uint8Array): Promise<Uint8Array[]>;
	/**
	 * Compact stored updates for `docId`.
	 *
	 * @remarks
	 * Host-implemented. Pen never calls `compact`. Compaction is a host storage
	 * concern: `Y.mergeUpdates` folds an update log, not tombstones. Snapshot
	 * retention and `gc: true` are separate tradeoffs — see the compaction
	 * notes in `@input/pen-crdt-yjs`.
	 */
	compact(docId: string): Promise<void>;
	/**
	 * Persist a version snapshot.
	 *
	 * @remarks
	 * Called by `@input/pen-history` `SnapshotManager.createSnapshot`.
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
	 * Called by `@input/pen-history` `SnapshotManager.createSnapshot` (latest
	 * entry after write) and `SnapshotManager.listSnapshots`.
	 */
	listVersions(
		docId: string,
		options?: { limit?: number; before?: string },
	): Promise<VersionEntry[]>;
	/**
	 * Load a version snapshot for restore.
	 *
	 * @remarks
	 * Called by `@input/pen-history` `SnapshotManager.restoreSnapshot`.
	 * There is no `getVersionSnapshots`; listing is {@link PenPersistence.listVersions}.
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
	 * `@input/pen-import-html` `applyHtmlImageSrcPolicy` before `upload`.
	 * The same limit is forwarded as {@link AssetUploadOptions.maxSize}.
	 */
	readonly maxSize?: number;
	/**
	 * Store `file` and return a durable ref.
	 *
	 * @remarks
	 * Called by `@input/pen-dom` `uploadImageFiles` (paste/drop) and
	 * `@input/pen-import-html` `applyHtmlImageSrcPolicy` when `imageSrc` is
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
