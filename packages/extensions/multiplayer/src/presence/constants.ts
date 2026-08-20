/** COL2: max `user.id` code units accepted from a peer. */
export const MAX_PRESENCE_USER_ID_LENGTH = 128;

/** COL2: max `user.name` code units accepted from a peer. */
export const MAX_PRESENCE_DISPLAY_NAME_LENGTH = 64;

/** COL2: max `user.avatar` code units accepted from a peer. */
export const MAX_PRESENCE_AVATAR_URL_LENGTH = 2_048;

/** COL2: max `user.color` code units before the color is ignored. */
export const MAX_PRESENCE_COLOR_LENGTH = 64;

/** COL2: max UTF-8 bytes of one peer's awareness payload. */
export const MAX_PRESENCE_BYTES_PER_PEER = 4_096;

/** COL2: max block ids in one remote block selection. */
export const MAX_PRESENCE_BLOCK_SELECTION_IDS = 256;

/** COL2: max awareness updates accepted per peer per second. */
export const MAX_PRESENCE_UPDATES_PER_SECOND = 10;

/** COL2: max remote peers whose presence is tracked and rendered. */
export const MAX_TRACKED_PEERS = 32;

export const PRESENCE_REJECTED_CODE = "presence-rejected";

export type PresenceRejectionReason =
	| "oversized"
	| "wrong-typed"
	| "script-bearing"
	| "nonexistent-block"
	| "out-of-range-offset"
	| "rate-limited"
	| "peer-cap";
