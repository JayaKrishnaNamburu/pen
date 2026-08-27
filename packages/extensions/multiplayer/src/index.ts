export {
	multiplayerExtension,
	MULTIPLAYER_EXTENSION_NAME,
	getMultiplayerController,
} from "./extension";

export { asPresenceDisplayHint } from "./presence/identityMap";
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
	MAX_PRESENCE_ANCHOR_LENGTH,
	MAX_PRESENCE_OFFSET,
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
	MultiplayerCellCoord,
	MultiplayerConfig,
	MultiplayerController,
	MultiplayerSnapshot,
	MultiplayerState,
	MultiplayerUser,
	PeerState,
	PresenceDisplayHint,
	ResolvePeerIdentity,
	ResolvePeerIdentityContext,
	RemoteCellSelectionState,
	RemoteCursorState,
	RemoteSelectionState,
	RemoteStreamingState,
} from "./types";
