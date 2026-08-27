"use client";

export {
	MultiplayerPresenceList,
	MultiplayerRemoteCursors,
	MultiplayerCaretOverlay,
	type MultiplayerPresenceListProps,
	type MultiplayerCaretOverlayProps,
	type MultiplayerCaretRenderProps,
	type MultiplayerRemoteCursorsProps,
} from "./primitives/multiplayer/index";
export { useMultiplayer } from "./hooks/useMultiplayer";
export { useRemoteCursors } from "./hooks/useRemoteCursors";
export { useRemoteSelections } from "./hooks/useRemoteSelections";
export {
	resolveRemoteCellPresence,
	type RemoteCellPresence,
	type RemoteCellPresenceMap,
} from "./utils/remoteCellSelection";
export type {
	MultiplayerState,
	PeerState,
	RemoteCellSelectionState,
	RemoteCursorState,
	RemoteSelectionState,
} from "@input/pen-multiplayer";
