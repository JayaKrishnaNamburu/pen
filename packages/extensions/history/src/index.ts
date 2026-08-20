export {
	historyExtension,
	HISTORY_CONTROLLER_SLOT,
	HISTORY_EXTENSION_NAME,
	getHistoryController,
} from "./extension";
export { HistoryControllerImpl } from "./controller";
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
