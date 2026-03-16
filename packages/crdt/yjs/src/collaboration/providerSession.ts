import type {
	ConnectionState,
	Editor,
	MultiplayerSession,
	Unsubscribe,
} from "@pen/types";
import * as Y from "yjs";

export type YjsProviderStatus = "disconnected" | "connecting" | "connected";

export interface YjsProviderAdapter {
	connect(): void;
	disconnect(): void;
	destroy(): void;
	getStatus?(): YjsProviderStatus;
	getIsSynced?(): boolean;
	onStatusChange(listener: (status: YjsProviderStatus) => void): Unsubscribe;
	onSync?(listener: (isSynced: boolean) => void): Unsubscribe;
}

export function getYjsDoc(editor: Editor): Y.Doc {
	return editor.internals.adapter.raw<Y.Doc>(editor.internals.crdtDoc);
}

export function createYjsProviderSession(
	provider: YjsProviderAdapter,
): MultiplayerSession {
	return new YjsProviderSession(provider);
}

class YjsProviderSession implements MultiplayerSession {
	private readonly listeners = new Set<(state: ConnectionState) => void>();
	private readonly statusCleanup: Unsubscribe;
	private readonly syncCleanup: Unsubscribe | null;
	private readonly supportsSyncEvents: boolean;

	private isSynced = false;
	private state: ConnectionState = "disconnected";

	constructor(private readonly provider: YjsProviderAdapter) {
		this.supportsSyncEvents = typeof provider.onSync === "function";
		this.isSynced = provider.getIsSynced?.() ?? false;
		this.statusCleanup = provider.onStatusChange((status) => {
			this.handleStatusChange(status);
		});
		this.syncCleanup = provider.onSync
			? provider.onSync((isSynced) => {
					this.handleSyncChange(isSynced);
				})
			: null;
		this.handleStatusChange(provider.getStatus?.() ?? "disconnected");
	}

	get connectionState(): ConnectionState {
		return this.state;
	}

	connect(): void {
		this.provider.connect();
	}

	disconnect(): void {
		this.provider.disconnect();
	}

	destroy(): void {
		this.syncCleanup?.();
		this.statusCleanup();
		this.provider.destroy();
		this.listeners.clear();
	}

	onStateChange(listener: (state: ConnectionState) => void): Unsubscribe {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private handleStatusChange(status: YjsProviderStatus): void {
		if (status !== "connected") {
			this.isSynced = false;
		}

		if (status === "connected") {
			this.setState(
				this.supportsSyncEvents && !this.isSynced ? "syncing" : "connected",
			);
			return;
		}

		this.setState(status);
	}

	private handleSyncChange(isSynced: boolean): void {
		this.isSynced = isSynced;

		if (this.state === "disconnected" || this.state === "connecting") {
			return;
		}

		this.setState(isSynced ? "connected" : "syncing");
	}

	private setState(nextState: ConnectionState): void {
		if (this.state === nextState) {
			return;
		}

		this.state = nextState;
		for (const listener of this.listeners) {
			listener(nextState);
		}
	}
}
