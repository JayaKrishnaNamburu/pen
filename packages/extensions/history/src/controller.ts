import {
	AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
	type Unsubscribe,
	type VersionEntry,
	type VersionMetadata,
} from "@pen/types";
import { buildBlameRanges } from "./attribution/blameView";
import { getCharacterAttribution } from "./attribution/characterAttribution";
import { AutoSnapshotScheduler } from "./snapshots/autoSnapshot";
import { SnapshotManager } from "./snapshots/snapshotManager";
import type {
	HistoryController,
	HistoryControllerOptions,
	HistoryState,
} from "./types";

export class HistoryControllerImpl implements HistoryController {
	private editor;
	private readonly listeners = new Set<() => void>();
	private readonly snapshotManager: SnapshotManager;
	private readonly autoSnapshotScheduler: AutoSnapshotScheduler | null;
	private readonly editors = new Set<HistoryControllerOptions["editor"]>();
	private state: HistoryState = {
		snapshots: [],
		isRestoring: false,
	};

	constructor(options: HistoryControllerOptions) {
		this.editor = options.editor;
		this.editors.add(options.editor);
		this.snapshotManager = new SnapshotManager(
			options.editor,
			options.persistence,
			options.docId,
		);
		this.autoSnapshotScheduler =
			options.autoSnapshot === false
				? null
				: new AutoSnapshotScheduler(
						options.editor,
						this.snapshotManager,
						options.autoSnapshot,
					);
	}

	attachEditor(editor: HistoryControllerOptions["editor"]): void {
		if (this.editors.has(editor)) {
			return;
		}
		this.editors.add(editor);
		this.setActiveEditor(editor);
	}

	detachEditor(editor: HistoryControllerOptions["editor"]): void {
		this.editors.delete(editor);
		if (this.editor !== editor) {
			return;
		}
		const nextEditor = this.editors.values().next().value ?? null;
		if (nextEditor) {
			this.setActiveEditor(nextEditor);
		}
	}

	isIdle(): boolean {
		return this.editors.size === 0;
	}

	getState(): HistoryState {
		return this.state;
	}

	subscribe(listener: () => void): Unsubscribe {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async createSnapshot(
		label?: string,
		trigger?: VersionMetadata["trigger"],
	): Promise<VersionEntry> {
		const snapshot = await this.snapshotManager.createSnapshot(label, trigger);
		await this.refreshSnapshots();
		return snapshot;
	}

	async restoreSnapshot(snapshotId: string): Promise<void> {
		this.setState({
			...this.state,
			isRestoring: true,
		});

		try {
			await this.snapshotManager.restoreSnapshot(snapshotId);
			await this.awaitEditorsSettled();
			await this.refreshSnapshots();
		} finally {
			this.setState({
				...this.state,
				isRestoring: false,
			});
		}
	}

	async listSnapshots(): Promise<readonly VersionEntry[]> {
		return this.refreshSnapshots();
	}

	getCharacterAttribution(blockId: string) {
		return getCharacterAttribution(this.editor, blockId);
	}

	getBlameRanges(blockId: string) {
		return buildBlameRanges(this.getCharacterAttribution(blockId));
	}

	triggerAISnapshot(): Promise<void> {
		return this.autoSnapshotScheduler?.triggerAISnapshot() ?? Promise.resolve();
	}

	destroy(): void {
		this.autoSnapshotScheduler?.destroy();
		this.editors.clear();
		this.listeners.clear();
	}

	private async refreshSnapshots(): Promise<readonly VersionEntry[]> {
		const snapshots = await this.snapshotManager.listSnapshots();
		this.setState({
			...this.state,
			snapshots,
		});
		return snapshots;
	}

	private setState(state: HistoryState): void {
		this.state = state;
		for (const listener of this.listeners) {
			listener();
		}
	}

	private setActiveEditor(editor: HistoryControllerOptions["editor"]): void {
		this.editor = editor;
		this.snapshotManager.updateEditor(editor);
		this.autoSnapshotScheduler?.updateEditor(editor);
	}

	private async awaitEditorsSettled(): Promise<void> {
		const lifecyclePromises = Array.from(this.editors, (editor) => {
			const awaitLifecycle =
				editor.internals.getSlot<() => Promise<void>>(
					AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
				);
			return awaitLifecycle?.() ?? Promise.resolve();
		});
		await Promise.all(lifecyclePromises);
	}
}
