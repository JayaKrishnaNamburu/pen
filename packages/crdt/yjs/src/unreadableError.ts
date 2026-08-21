import type { PenFormatStamp } from "@input/pen-types";

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
