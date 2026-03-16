import type { Editor, PenPersistence, VersionEntry, VersionMetadata } from "@pen/types";

export class SnapshotManager {
	private editor: Editor;
	private readonly persistence: PenPersistence;
	private readonly docId: string;

	constructor(editor: Editor, persistence: PenPersistence, docId: string) {
		this.editor = editor;
		this.persistence = persistence;
		this.docId = docId;
	}

	updateEditor(editor: Editor): void {
		this.editor = editor;
	}

	async createSnapshot(
		label?: string,
		trigger: VersionMetadata["trigger"] = "manual",
	): Promise<VersionEntry> {
		const adapter = this.editor.internals.adapter;
		const snapshot = adapter.createSnapshot(this.editor.internals.crdtDoc);
		const metadata: VersionMetadata = {
			label,
			trigger,
			clientId: this.editor.clientId,
			timestamp: Date.now(),
		};

		await this.persistence.saveVersionSnapshot(this.docId, snapshot, metadata);

		const [latestEntry] = await this.persistence.listVersions(this.docId, {
			limit: 1,
		});

		return (
			latestEntry ?? {
				id: crypto.randomUUID(),
				metadata,
				createdAt: metadata.timestamp,
			}
		);
	}

	async restoreSnapshot(snapshotId: string): Promise<void> {
		const snapshotEntry = await this.persistence.loadVersion(
			this.docId,
			snapshotId,
		);

		if (!snapshotEntry) {
			throw new Error(`Snapshot ${snapshotId} not found`);
		}

		await this.createSnapshot("Pre-restore auto-save", "manual");

		const adapter = this.editor.internals.adapter;
		const restoredDoc = adapter.restoreSnapshot(
			this.editor.internals.crdtDoc,
			snapshotEntry.snapshot,
		);
		const documentSession = this.editor.internals.documentSession;
		if (documentSession) {
			documentSession.replaceScopeDocument(
				this.editor.internals.documentScope.id,
				restoredDoc,
			);
			return;
		}

		this.editor.loadDocument(restoredDoc);
	}

	async listSnapshots(): Promise<readonly VersionEntry[]> {
		const snapshots = await this.persistence.listVersions(this.docId);
		return [...snapshots].sort((left, right) => right.createdAt - left.createdAt);
	}
}
