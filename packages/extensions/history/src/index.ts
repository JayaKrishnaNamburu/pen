export {
	historyExtension,
	HISTORY_EXTENSION_NAME,
	getHistoryController,
} from "./extension";
export { getCharacterAttribution } from "./attribution/characterAttribution";
export { buildBlameRanges } from "./attribution/blameView";

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
