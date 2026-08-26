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

/**
 * Who Pen is willing to name as the author of a change. Either a
 * host-resolved identity or, when no resolver is configured, the opaque
 * client handle — the `verified` discriminant is what a renderer checks
 * before presenting a name as authorship.
 */
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

/**
 * One authored run of characters inside a block, as reported by the CRDT
 * adapter. `offset` and `length` address the block's text; `author` is
 * the trust-checked identity while `displayHint` is the peer-asserted
 * presence name and must not be rendered as authorship.
 */
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

/**
 * A blame span over a block's text, as `[from, to)` offsets. The
 * render-facing shape of {@link CharacterAttribution}: same trust
 * boundary, without the per-character bookkeeping a decoration layer
 * does not need.
 */
export interface BlameRange {
	from: number;
	to: number;
	author: HistoryAuthor;
	displayHint?: PresenceDisplayHint;
	timestamp: number;
}

/**
 * When the history extension takes a snapshot on its own. Every field is
 * optional and unset triggers stay off, so a host opts into each one;
 * passing `false` for `autoSnapshot` instead disables automatic
 * snapshots entirely and leaves only explicit `createSnapshot` calls.
 */
export interface AutoSnapshotConfig {
	intervalMs?: number;
	opThreshold?: number;
	onSessionStart?: boolean;
	onAIGeneration?: boolean;
}

/** Host configuration for {@link historyExtension}. */
export interface HistoryConfig {
	persistence: PenPersistence;
	docId: string;
	autoSnapshot?: AutoSnapshotConfig | false;
	/** Host-verified identity. Without this, attribution reports an opaque client handle. */
	resolveAuthor?: ResolveHistoryAuthor;
}

/**
 * Snapshot state a host renders from. `isRestoring` is true while a
 * restore is in flight, which is the window a version UI should treat as
 * busy rather than as a settled document.
 */
export interface HistoryState {
	snapshots: readonly VersionEntry[];
	isRestoring: boolean;
}

/**
 * The history extension's host-facing handle: snapshot listing and
 * creation, restore, and per-block attribution. Reach it with
 * {@link getHistoryController} rather than constructing one — the
 * extension owns its lifetime and clears the slot on deactivate.
 */
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
