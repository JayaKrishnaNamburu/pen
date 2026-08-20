export const PEN_DOCUMENT_FORMAT = 2;

export const PEN_FORMAT_METADATA_KEY = "penFormat";
export const DOCUMENT_PROFILE_METADATA_KEY = "documentProfile";
export const MIGRATION_LEDGER_METADATA_KEY = "penMigrations";

/**
 * Metadata keys Pen writes. Hosts may use any other key; Pen never inspects
 * those and preserves them verbatim (DUR1, DUR4).
 */
export const RESERVED_METADATA_KEYS = Object.freeze([
	PEN_FORMAT_METADATA_KEY,
	DOCUMENT_PROFILE_METADATA_KEY,
	MIGRATION_LEDGER_METADATA_KEY,
] as const);

export type ReservedMetadataKey = (typeof RESERVED_METADATA_KEYS)[number];

/**
 * Store-generation identity written at `metadata.penFormat`.
 *
 * `format` and `minReader` are about the Yjs store shape, not about schemas.
 * v2 does not change that shape, so it writes `minReader: 1` (DUR1).
 */
export interface PenFormatStamp {
	format: number;
	minReader: number;
	writer: string;
}

/**
 * Absent stamps are v1-by-absence, not corrupt. `writer` is `"unknown"` until
 * a v2 session writes the real stamp.
 */
export const IMPLICIT_V1_FORMAT_STAMP: PenFormatStamp = Object.freeze({
	format: 1,
	minReader: 1,
	writer: "unknown",
});

/**
 * Thrown by `loadDocument` when the stored document cannot be opened
 * (`minReader` above this reader's format, or a shared type with the wrong
 * Yjs constructor). This is the sanctioned exception to Pen's non-fatal
 * posture — a half-loaded document is how the next save becomes data loss.
 */
export class PenDocumentUnreadableError extends Error {
	readonly stamp: PenFormatStamp;
	readonly reason: string;

	constructor(stamp: PenFormatStamp, reason: string) {
		super(`Document is unreadable: ${reason}`);
		this.name = "PenDocumentUnreadableError";
		this.stamp = stamp;
		this.reason = reason;
	}
}
