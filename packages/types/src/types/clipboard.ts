export const PEN_CLIPBOARD_PAYLOAD_VERSION = 1;

/** Spec JSON flavor written on copy (SEC4 / IOP1). */
export const PEN_CLIPBOARD_JSON_MIME = "application/x-pen-blocks+json";

/** Pre-SEC4 flavor. Readers still accept it. */
export const PEN_CLIPBOARD_JSON_MIME_LEGACY = "application/x-pen-blocks";

export interface PenClipboardDelta {
	insert: string | { type: string; props?: Record<string, unknown> };
	attributes?: Record<string, unknown>;
}

export interface PenClipboardBlock {
	type: string;
	props?: Record<string, unknown>;
	content?: string;
	deltas?: readonly PenClipboardDelta[];
	children?: readonly PenClipboardBlock[];
	/** Partial inline copy: paste inserts into the current block, not as a new block. */
	isPartial?: boolean;
}

export interface PenClipboardPayload {
	version: number;
	blockTypes: readonly string[];
	blocks: readonly PenClipboardBlock[];
}
