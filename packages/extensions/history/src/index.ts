export {
	historyExtension,
	HISTORY_EXTENSION_NAME,
	getHistoryController,
} from "./extension";
export { SnapshotManager } from "./snapshots/snapshotManager";
export { AutoSnapshotScheduler } from "./snapshots/autoSnapshot";
export { getCharacterAttribution } from "./attribution/characterAttribution";
export { buildBlameRanges } from "./attribution/blameView";
export {
	opaqueClientHandle,
	resolveHistoryAuthor,
	resolvePresenceDisplayHint,
} from "./attribution/identityResolver";

export type {
	AutoSnapshotConfig,
	BlameRange,
	CharacterAttribution,
	HistoryAuthor,
	HistoryAuthorIdentity,
	HistoryConfig,
	HistoryController,
	HistoryState,
	OpaqueClientHandle,
	PresenceDisplayHint,
	ResolveHistoryAuthor,
	VerifiedHistoryAuthor,
} from "./types";
