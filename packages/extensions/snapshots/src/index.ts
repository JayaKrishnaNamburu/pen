export {
	snapshotsExtension,
	SNAPSHOTS_EXTENSION_NAME,
	getSnapshotsController,
} from "./extension";
export { getCharacterAttribution } from "./attribution/characterAttribution";
export { buildBlameRanges } from "./attribution/blameView";

export type {
	AutoSnapshotConfig,
	BlameRange,
	CharacterAttribution,
	SnapshotAuthor,
	SnapshotAuthorIdentity,
	SnapshotsConfig,
	SnapshotsController,
	SnapshotsState,
	OpaqueClientHandle,
	PresenceDisplayHint,
	ResolveSnapshotAuthor,
	VerifiedSnapshotAuthor,
} from "./types";
