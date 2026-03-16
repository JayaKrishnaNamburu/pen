import type { ConnectionState, Unsubscribe } from "@pen/types";
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
import { RemoteCursorManager } from "./presence/cursorManager";
import { RemoteSelectionManager } from "./presence/selectionManager";

export class MultiplayerControllerImpl implements MultiplayerController {
	private readonly localClientId: number;
	private readonly authorLedger: AuthorLedgerLike;
	private readonly identityMap: ClientIdentityMapLike;
	private readonly listeners = new Set<() => void>();
	private readonly cursorManager: RemoteCursorManager;
	private readonly selectionManager: RemoteSelectionManager;
	private connectHandler: (() => void) | null = null;
	private disconnectHandler: (() => void) | null = null;

	private remoteCursors: readonly RemoteCursorState[] = [];
	private remoteSelections: readonly RemoteSelectionState[] = [];
	private peers: readonly PeerState[] = [];

	private state: MultiplayerState;

	constructor(options: MultiplayerControllerOptions) {
		this.localClientId = options.editor.clientId;
		this.authorLedger = options.authorLedger;
		this.identityMap = options.identityMap;
		this.cursorManager = new RemoteCursorManager(this.localClientId);
		this.selectionManager = new RemoteSelectionManager(this.localClientId);
		this.state = {
			connectionState: "disconnected",
			peers: this.peers,
			localUser: options.config.user,
			isConnected: false,
		};
	}

	getState(): MultiplayerState {
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
		return this.peers;
	}

	getRemoteCursors(): readonly RemoteCursorState[] {
		return this.remoteCursors;
	}

	getRemoteSelections(): readonly RemoteSelectionState[] {
		return this.remoteSelections;
	}

	snapshot(): MultiplayerSnapshot {
		return {
			state: this.state,
			remoteCursors: this.remoteCursors,
			remoteSelections: this.remoteSelections,
		};
	}

	destroy(): void {
		this.connectHandler = null;
		this.disconnectHandler = null;
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
		this.identityMap.updateFromAwareness(states);
		for (const [clientId, user] of this.identityMap.entries()) {
			this.authorLedger.record(clientId, user);
		}
		this.remoteCursors = this.cursorManager.build(states, (clientId) =>
			this.identityMap.resolve(clientId),
		);
		this.remoteSelections = this.selectionManager.build(states, (clientId) =>
			this.identityMap.resolve(clientId),
		);
		this.peers = this.buildPeers(states);
		this.setState({
			...this.state,
			peers: this.peers,
		});
	}

	private setState(nextState: MultiplayerState): void {
		this.state = nextState;
		for (const listener of this.listeners) {
			listener();
		}
	}

	private buildPeers(
		states: Map<number, MultiplayerAwarenessState>,
	): readonly PeerState[] {
		const cursorMap = new Map(
			this.remoteCursors.map((cursor) => [cursor.clientId, cursor]),
		);
		const selectionMap = new Map(
			this.remoteSelections.map((selection) => [selection.clientId, selection]),
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
