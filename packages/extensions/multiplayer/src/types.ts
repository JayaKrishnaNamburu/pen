import type {
	Awareness,
	ConnectionState,
	Editor,
	MultiplayerSession,
	MultiplayerSessionContext,
	Unsubscribe,
} from "@input/pen-types";

export interface MultiplayerConfig {
	/**
	 * Host-provided presence. This payload is published on awareness and is
	 * visible to every peer in the room. Do not put emails, internal ids, or
	 * other secrets here unless they are meant to be broadcast.
	 */
	user: MultiplayerUser;
	autoConnect?: boolean;
	session?: MultiplayerSession;
	sessionFactory?: (
		context: MultiplayerSessionContext,
	) => MultiplayerSession;
	resolvePeerIdentity?: ResolvePeerIdentity;
}

/**
 * Host-provided presence fields. Peers see whatever the host puts here;
 * Pen treats the values as untrusted input on read (COL2).
 */
export interface MultiplayerUser {
	id: string;
	name: string;
	color?: string;
	avatar?: string;
	/** COL3: awareness/ledger identities are display hints, never verified. */
	readonly unverified?: true;
}

/** COL3: peer-asserted presence. Never render as verified authorship. */
export interface PresenceDisplayHint {
	readonly unverified: true;
	name: string;
	userId?: string;
	color?: string;
}

export interface RemoteCursorState {
	clientId: number;
	user: MultiplayerUser;
	blockId: string;
	offset: number;
	clock: number;
}

export interface RemoteTextSelectionState {
	kind: "text";
	clientId: number;
	user: MultiplayerUser;
	anchor: { blockId: string; offset: number };
	head: { blockId: string; offset: number };
	clock: number;
}

export interface RemoteBlockSelectionState {
	kind: "block";
	clientId: number;
	user: MultiplayerUser;
	blockIds: readonly string[];
	clock: number;
}

/** Row/column position of one remote cell-selection endpoint. */
export interface MultiplayerCellCoord {
	row: number;
	col: number;
}

/**
 * A peer's rectangular cell selection, clamped into the live grid on resolve.
 *
 * Carries no offset: a grid cell is the smallest region this presence names,
 * which is why a peer inside a table publishes no cursor.
 */
export interface RemoteCellSelectionState {
	kind: "cell";
	clientId: number;
	user: MultiplayerUser;
	blockId: string;
	anchor: MultiplayerCellCoord;
	head: MultiplayerCellCoord;
	clock: number;
}

export type RemoteSelectionState =
	| RemoteTextSelectionState
	| RemoteBlockSelectionState
	| RemoteCellSelectionState;

/**
 * A peer's in-flight AI run, resolved against the live document.
 *
 * Presence only: it names the block a generation is writing into and never
 * what it will say, because preview text stays on the client that asked for
 * it (RS1). Peers learn that a run is happening, not its contents.
 */
export interface RemoteStreamingState {
	clientId: number;
	user: MultiplayerUser;
	blockId: string;
}

export interface PeerState {
	clientId: number;
	user: MultiplayerUser;
	cursor: RemoteCursorState | null;
	selection: RemoteSelectionState | null;
	streaming: RemoteStreamingState | null;
	lastSeen: number;
}

export interface MultiplayerState {
	connectionState: ConnectionState;
	peers: readonly PeerState[];
	localUser: MultiplayerUser;
	isConnected: boolean;
}

export interface MultiplayerSnapshot {
	state: MultiplayerState;
	remoteCursors: readonly RemoteCursorState[];
	remoteSelections: readonly RemoteSelectionState[];
	remoteStreaming: readonly RemoteStreamingState[];
}

export interface MultiplayerCursorPayload {
	/** Serialized `editor.anchors.serialize` payload (AN11). */
	anchor: string;
	clock: number;
}

export interface MultiplayerTextSelectionPayload {
	kind?: "text";
	/** Serialized anchor for the selection start. */
	anchor: string;
	/** Serialized anchor for the selection head. */
	head: string;
	clock: number;
}

export interface MultiplayerBlockSelectionPayload {
	kind: "block";
	blockIds: readonly string[];
	clock: number;
}

/**
 * Grid coordinates rather than serialized anchors, matching AS3: cell
 * selections are driven by the commit summary's structural data and clamp into
 * the post-commit grid, so there is no in-block text identity to anchor.
 */
export interface MultiplayerCellSelectionPayload {
	kind: "cell";
	blockId: string;
	anchor: MultiplayerCellCoord;
	head: MultiplayerCellCoord;
	clock: number;
}

export type MultiplayerSelectionPayload =
	| MultiplayerTextSelectionPayload
	| MultiplayerBlockSelectionPayload
	| MultiplayerCellSelectionPayload;

/**
 * Published while an AI run writes into a block, cleared when it ends. Carries
 * the block and nothing else: a prompt or a preview here would put one client's
 * unaccepted text on every peer's screen.
 */
export interface MultiplayerStreamingPayload {
	blockId: string;
}

export interface MultiplayerAwarenessState extends Record<string, unknown> {
	user?: MultiplayerUser;
	cursor?: MultiplayerCursorPayload | null;
	selection?: MultiplayerSelectionPayload | null;
	streaming?: MultiplayerStreamingPayload | null;
}

export interface ResolvePeerIdentityContext {
	clientId: number;
	source: "local-config" | "remote-awareness" | "fallback";
	awareness: MultiplayerAwarenessState | null;
	defaultColor: string;
}

export type ResolvePeerIdentity = (
	user: MultiplayerUser,
	context: ResolvePeerIdentityContext,
) => MultiplayerUser;

export type AuthorIdentity = MultiplayerUser;

export interface AuthorLedgerEntry {
	clientId: number;
	author: AuthorIdentity;
	firstSeenAt: number;
	lastSeenAt: number;
}

export interface AuthorLedgerLike {
	record(clientId: number, author: AuthorIdentity, timestamp?: number): void;
	resolve(clientId: number): AuthorIdentity | null;
	entries(): readonly AuthorLedgerEntry[];
}

export interface ClientIdentityMapLike {
	set(clientId: number, user: MultiplayerUser): void;
	get(clientId: number): MultiplayerUser | null;
	resolve(clientId: number): MultiplayerUser;
	updateFromAwareness(
		states: Awareness["getStates"] extends () => infer T
			? T
			: Map<number, MultiplayerAwarenessState>,
	): void;
	entries(): ReadonlyMap<number, MultiplayerUser>;
}

export interface MultiplayerController {
	getState(): MultiplayerState;
	subscribe(listener: () => void): Unsubscribe;
	connect(): void;
	disconnect(): void;
	getAuthorLedger(): AuthorLedgerLike;
	getIdentityMap(): ClientIdentityMapLike;
	getPeers(): readonly PeerState[];
	getRemoteCursors(): readonly RemoteCursorState[];
	getRemoteSelections(): readonly RemoteSelectionState[];
	getRemoteStreaming(): readonly RemoteStreamingState[];
	snapshot(): MultiplayerSnapshot;
}

export interface MultiplayerControllerOptions {
	editor: Editor;
	config: MultiplayerConfig;
	authorLedger: AuthorLedgerLike;
	identityMap: ClientIdentityMapLike;
	now?: () => number;
}
