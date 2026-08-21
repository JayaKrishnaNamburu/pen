export {
	multiplayerExtension,
	MULTIPLAYER_EXTENSION_NAME,
	MULTIPLAYER_CONTROLLER_SLOT,
	getMultiplayerController,
} from "./extension";

export { MultiplayerControllerImpl } from "./controller";
export { AuthorLedger } from "./presence/authorLedger";
export {
	ClientIdentityMap,
	asPresenceDisplayHint,
} from "./presence/identityMap";
export {
	assignMultiplayerColor,
	normalizeMultiplayerColor,
} from "./presence/colorAssignment";
export {
	MAX_PRESENCE_AVATAR_URL_LENGTH,
	MAX_PRESENCE_BLOCK_SELECTION_IDS,
	MAX_PRESENCE_BYTES_PER_PEER,
	MAX_PRESENCE_COLOR_LENGTH,
	MAX_PRESENCE_DISPLAY_NAME_LENGTH,
	MAX_PRESENCE_UPDATES_PER_SECOND,
	MAX_PRESENCE_USER_ID_LENGTH,
	MAX_TRACKED_PEERS,
	PRESENCE_REJECTED_CODE,
} from "./presence/constants";
export type { PresenceRejectionReason } from "./presence/constants";

export type {
	ConnectionState,
	MultiplayerSession,
	MultiplayerSessionContext,
} from "@input/pen-types";

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
	PresenceDisplayHint,
	ResolvePeerIdentity,
	ResolvePeerIdentityContext,
	RemoteCursorState,
	RemoteSelectionState,
} from "./types";
