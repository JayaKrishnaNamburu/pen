import type { Awareness } from "./crdt";
import type { Editor } from "./editor";
import type { Unsubscribe } from "./utility";

export type ConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "syncing"
	| "error";

export interface MultiplayerSessionContext {
	editor: Editor;
	awareness: Awareness;
}

export interface MultiplayerSession {
	readonly connectionState: ConnectionState;
	connect(): void;
	disconnect(): void;
	destroy(): void;
	onStateChange(listener: (state: ConnectionState) => void): Unsubscribe;
}
