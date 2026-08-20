import type {
	Editor,
	PenPersistence,
	Unsubscribe,
	VersionEntry,
	VersionMetadata,
} from "@input/pen-types";

/** Host-verified author fields. The resolver return type; Pen stamps `verified`. */
export interface HistoryAuthorIdentity {
	id: string;
	name: string;
	color?: string;
}

/**
 * Host-supplied `clientId` → author mapping. This is the attribution trust
 * boundary: only values returned here are presented as verified identity.
 */
export type ResolveHistoryAuthor = (
	clientId: number,
) => HistoryAuthorIdentity | null | undefined;

/** Host-resolved identity. Never a peer-asserted presence name. */
export interface VerifiedHistoryAuthor extends HistoryAuthorIdentity {
	readonly verified: true;
}

/** Opaque Yjs client handle used when no host resolver is configured. */
export interface OpaqueClientHandle {
	readonly verified: false;
	id: string;
	name: string;
	clientId: number;
}

export type HistoryAuthor = VerifiedHistoryAuthor | OpaqueClientHandle;

/**
 * Peer-asserted presence. Unverified display hint — must not be rendered
 * as authorship or stored as a snapshot author.
 */
export interface PresenceDisplayHint {
	readonly unverified: true;
	name: string;
	userId?: string;
	color?: string;
}

export interface CharacterAttribution {
	blockId: string;
	offset: number;
	length: number;
	clientId: number;
	author: HistoryAuthor;
	displayHint?: PresenceDisplayHint;
	userId: string;
	userName: string;
	color?: string;
	timestamp: number;
}

export interface BlameRange {
	from: number;
	to: number;
	author: HistoryAuthor;
	displayHint?: PresenceDisplayHint;
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
	/** Host-verified identity. Without this, attribution reports an opaque client handle. */
	resolveAuthor?: ResolveHistoryAuthor;
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
	readonly resolveAuthor?: ResolveHistoryAuthor;
}

export interface HistoryControllerOptions {
	editor: Editor;
	persistence: PenPersistence;
	docId: string;
	autoSnapshot?: AutoSnapshotConfig | false;
	resolveAuthor?: ResolveHistoryAuthor;
}
