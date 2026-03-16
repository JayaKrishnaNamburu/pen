export {
	multiplayerExtension,
	MULTIPLAYER_EXTENSION_NAME,
	MULTIPLAYER_CONTROLLER_SLOT,
	getMultiplayerController,
} from "./extension";

export { MultiplayerControllerImpl } from "./controller";
export { AuthorLedger } from "./presence/authorLedger";
export { ClientIdentityMap } from "./presence/identityMap";
export {
	assignMultiplayerColor,
	normalizeMultiplayerColor,
} from "./presence/colorAssignment";

export type {
	ConnectionState,
	MultiplayerSession,
	MultiplayerSessionContext,
} from "@pen/types";

export type {
	AuthorIdentity,
	AuthorLedgerEntry,
	AuthorLedgerLike,
	ClientIdentityMapLike,
	MultiplayerConfig,
	MultiplayerController,
	MultiplayerSnapshot,
	MultiplayerState,
	MultiplayerUser,
	PeerState,
	ResolvePeerIdentity,
	ResolvePeerIdentityContext,
	RemoteCursorState,
	RemoteSelectionState,
} from "./types";
