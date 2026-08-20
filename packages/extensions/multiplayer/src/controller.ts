import type { ConnectionState, Editor, Unsubscribe } from "@input/pen-types";
import type {
	AuthorLedgerLike,
	ClientIdentityMapLike,
	MultiplayerAwarenessState,
	MultiplayerController,
	MultiplayerControllerOptions,
	MultiplayerSnapshot,
	MultiplayerState,
	PeerState,
	RemoteCursorState,
	RemoteSelectionState,
} from "./types";
import { PRESENCE_REJECTED_CODE } from "./presence/constants";
import { RemoteCursorManager } from "./presence/cursorManager";
import {
	mapRemoteCursors,
	mapRemoteSelections,
} from "./presence/mapRemoteSelection";
import { PresenceIngest } from "./presence/presenceIngest";
import { RemoteSelectionManager } from "./presence/selectionManager";

export class MultiplayerControllerImpl implements MultiplayerController {
	private readonly editor: Editor;
	private readonly localClientId: number;
	private readonly authorLedger: AuthorLedgerLike;
	private readonly identityMap: ClientIdentityMapLike;
	private readonly ingest: PresenceIngest;
	private readonly listeners = new Set<() => void>();
	private readonly cursorManager: RemoteCursorManager;
	private readonly selectionManager: RemoteSelectionManager;
	private connectHandler: (() => void) | null = null;
	private disconnectHandler: (() => void) | null = null;

	private lastAccepted: Map<number, MultiplayerAwarenessState> | null = null;
	private remoteCursors: readonly RemoteCursorState[] = [];
	private remoteSelections: readonly RemoteSelectionState[] = [];
	private peers: readonly PeerState[] = [];
	private mappedCursors: readonly RemoteCursorState[] = [];
	private mappedSelections: readonly RemoteSelectionState[] = [];
	private mappedPeers: readonly PeerState[] = [];
	private mappedCommitId = -1;
	private mappedAccepted: Map<number, MultiplayerAwarenessState> | null =
		null;
	private readonly unsubscribeCommit: Unsubscribe;
	private state: MultiplayerState;

	constructor(options: MultiplayerControllerOptions) {
		this.editor = options.editor;
		this.localClientId = options.editor.clientId;
		this.authorLedger = options.authorLedger;
		this.identityMap = options.identityMap;
		this.ingest = new PresenceIngest({
			editor: options.editor,
			localClientId: this.localClientId,
			now: options.now,
		});
		this.cursorManager = new RemoteCursorManager(this.localClientId);
		this.selectionManager = new RemoteSelectionManager(this.localClientId);
		this.state = {
			connectionState: "disconnected",
			peers: this.peers,
			localUser: options.config.user,
			isConnected: false,
		};
		this.unsubscribeCommit = options.editor.on("commit", () => {
			this.invalidateMapped();
			this.ensureMapped();
			if (this.state.peers !== this.mappedPeers) {
				this.setState({
					...this.state,
					peers: this.mappedPeers,
				});
			}
		});
	}

	getState(): MultiplayerState {
		this.ensureMapped();
		return this.state;
	}

	subscribe(listener: () => void): Unsubscribe {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	connect(): void {
		if (this.connectHandler) {
			this.connectHandler();
			return;
		}
		this.setConnectionState("connecting");
	}

	disconnect(): void {
		if (this.disconnectHandler) {
			this.disconnectHandler();
			return;
		}
		this.setConnectionState("disconnected");
	}

	getAuthorLedger(): AuthorLedgerLike {
		return this.authorLedger;
	}

	getIdentityMap(): ClientIdentityMapLike {
		return this.identityMap;
	}

	getPeers(): readonly PeerState[] {
		this.ensureMapped();
		return this.mappedPeers;
	}

	getRemoteCursors(): readonly RemoteCursorState[] {
		this.ensureMapped();
		return this.mappedCursors;
	}

	getRemoteSelections(): readonly RemoteSelectionState[] {
		this.ensureMapped();
		return this.mappedSelections;
	}

	snapshot(): MultiplayerSnapshot {
		return {
			state: this.state,
			remoteCursors: this.getRemoteCursors(),
			remoteSelections: this.getRemoteSelections(),
		};
	}

	destroy(): void {
		this.unsubscribeCommit();
		this.connectHandler = null;
		this.disconnectHandler = null;
		this.ingest.destroy();
		this.listeners.clear();
	}

	setConnectionLifecycleHandlers(handlers: {
		connect: () => void;
		disconnect: () => void;
	}): void {
		this.connectHandler = handlers.connect;
		this.disconnectHandler = handlers.disconnect;
	}

	setConnectionState(connectionState: ConnectionState): void {
		this.setState({
			...this.state,
			connectionState,
			isConnected: connectionState === "connected",
		});
	}

	handleAwarenessChange(states: Map<number, MultiplayerAwarenessState>): void {
		try {
			const accepted = this.ingest.ingest(states);
			this.identityMap.updateFromAwareness(accepted);
			for (const [clientId, user] of this.identityMap.entries()) {
				this.authorLedger.record(clientId, user);
			}
			this.lastAccepted = accepted;
			this.remoteCursors = this.cursorManager.build(accepted, (clientId) =>
				this.identityMap.resolve(clientId),
			);
			this.remoteSelections = this.selectionManager.build(
				accepted,
				(clientId) => this.identityMap.resolve(clientId),
			);
			this.invalidateMapped();
			this.ensureMapped();
			this.peers = this.mappedPeers;
			this.setState({
				...this.state,
				peers: this.mappedPeers,
			});
		} catch (error) {
			this.editor.internals.emit("diagnostic", {
				code: PRESENCE_REJECTED_CODE,
				level: "warn",
				source: "multiplayer",
				extension: "multiplayer",
				message: "Presence ingest failed.",
				error,
			});
		}
	}

	private setState(nextState: MultiplayerState): void {
		this.state = nextState;
		for (const listener of this.listeners) {
			listener();
		}
	}

	private invalidateMapped(): void {
		this.mappedCommitId = -1;
		this.mappedAccepted = null;
	}

	private ensureMapped(): void {
		const latest = this.editor.summaryLog.latest()?.commitId ?? 0;
		if (
			this.mappedCommitId === latest &&
			this.mappedAccepted === this.lastAccepted
		) {
			return;
		}

		const nextCursors = this.lastAccepted
			? mapRemoteCursors(this.editor, this.remoteCursors, this.lastAccepted)
			: this.remoteCursors;
		const nextSelections = this.lastAccepted
			? mapRemoteSelections(
					this.editor,
					this.remoteSelections,
					this.lastAccepted,
				)
			: this.remoteSelections;
		this.mappedCursors = reuseIfSame(this.mappedCursors, nextCursors);
		this.mappedSelections = reuseIfSame(
			this.mappedSelections,
			nextSelections,
		);

		const nextPeers = this.lastAccepted
			? this.buildPeers(this.lastAccepted)
			: this.peers;
		this.mappedPeers = reuseIfSame(this.mappedPeers, nextPeers);
		this.mappedCommitId = latest;
		this.mappedAccepted = this.lastAccepted;
	}

	private buildPeers(
		states: Map<number, MultiplayerAwarenessState>,
	): readonly PeerState[] {
		const cursorMap = new Map(
			this.mappedCursors.map((cursor) => [cursor.clientId, cursor]),
		);
		const selectionMap = new Map(
			this.mappedSelections.map((selection) => [
				selection.clientId,
				selection,
			]),
		);
		const peers: PeerState[] = [];

		for (const [clientId] of states) {
			if (clientId === this.localClientId) {
				continue;
			}

			const cursor = cursorMap.get(clientId) ?? null;
			const selection = selectionMap.get(clientId) ?? null;
			peers.push({
				clientId,
				user: this.identityMap.resolve(clientId),
				cursor,
				selection,
				lastSeen: Math.max(
					cursor?.clock ?? 0,
					selection?.clock ?? 0,
				),
			});
		}

		return peers;
	}
}

function reuseIfSame<T>(prev: readonly T[], next: readonly T[]): readonly T[] {
	if (prev === next) {
		return prev;
	}
	if (prev.length !== next.length) {
		return next;
	}
	for (let i = 0; i < prev.length; i++) {
		if (prev[i] !== next[i]) {
			return next;
		}
	}
	return prev;
}
