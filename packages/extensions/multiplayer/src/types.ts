import type {
	Awareness,
	ConnectionState,
	Editor,
	MultiplayerSession,
	MultiplayerSessionContext,
	Unsubscribe,
} from "@pen/types";

export interface MultiplayerConfig {
	user: MultiplayerUser;
	autoConnect?: boolean;
	session?: MultiplayerSession;
	sessionFactory?: (
		context: MultiplayerSessionContext,
	) => MultiplayerSession;
	resolvePeerIdentity?: ResolvePeerIdentity;
}

export interface MultiplayerUser {
	id: string;
	name: string;
	color?: string;
	avatar?: string;
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

export type RemoteSelectionState =
	| RemoteTextSelectionState
	| RemoteBlockSelectionState;

export interface PeerState {
	clientId: number;
	user: MultiplayerUser;
	cursor: RemoteCursorState | null;
	selection: RemoteSelectionState | null;
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
}

export interface MultiplayerCursorPayload {
	blockId: string;
	offset: number;
	clock: number;
}

export interface MultiplayerTextSelectionPayload {
	kind?: "text";
	anchor: { blockId: string; offset: number };
	head: { blockId: string; offset: number };
	clock: number;
}

export interface MultiplayerBlockSelectionPayload {
	kind: "block";
	blockIds: readonly string[];
	clock: number;
}

export type MultiplayerSelectionPayload =
	| MultiplayerTextSelectionPayload
	| MultiplayerBlockSelectionPayload;

export interface MultiplayerAwarenessState extends Record<string, unknown> {
	user?: MultiplayerUser;
	cursor?: MultiplayerCursorPayload | null;
	selection?: MultiplayerSelectionPayload | null;
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
	snapshot(): MultiplayerSnapshot;
}

export interface MultiplayerControllerOptions {
	editor: Editor;
	config: MultiplayerConfig;
	authorLedger: AuthorLedgerLike;
	identityMap: ClientIdentityMapLike;
}
