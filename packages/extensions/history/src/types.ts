import type {
	Editor,
	PenPersistence,
	Unsubscribe,
	VersionEntry,
	VersionMetadata,
} from "@pen/types";

export interface CharacterAttribution {
	blockId: string;
	offset: number;
	length: number;
	clientId: number;
	userId: string;
	userName: string;
	color?: string;
	timestamp: number;
}

export interface HistoryAuthor {
	id: string;
	name: string;
	color?: string;
}

export interface BlameRange {
	from: number;
	to: number;
	author: HistoryAuthor;
	timestamp: number;
}

export interface AutoSnapshotConfig {
	intervalMs?: number;
	opThreshold?: number;
	onSessionStart?: boolean;
	onAIGeneration?: boolean;
}

export interface HistoryConfig {
	persistence: PenPersistence;
	docId: string;
	autoSnapshot?: AutoSnapshotConfig | false;
}

export interface HistoryState {
	snapshots: readonly VersionEntry[];
	isRestoring: boolean;
}

export interface HistoryController {
	getState(): HistoryState;
	subscribe(listener: () => void): Unsubscribe;
	createSnapshot(
		label?: string,
		trigger?: VersionMetadata["trigger"],
	): Promise<VersionEntry>;
	restoreSnapshot(snapshotId: string): Promise<void>;
	listSnapshots(): Promise<readonly VersionEntry[]>;
	getCharacterAttribution(blockId: string): readonly CharacterAttribution[];
	getBlameRanges(blockId: string): readonly BlameRange[];
}

export interface HistoryControllerOptions {
	editor: Editor;
	persistence: PenPersistence;
	docId: string;
	autoSnapshot?: AutoSnapshotConfig | false;
}
