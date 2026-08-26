import * as Y from "yjs";

import { BLOCKS } from "./document";

/** Diagnostic code for DUR6 growth reporting. */
export const DOCUMENT_SIZE_DIAGNOSTIC_CODE = "document-size";

/**
 * Encoded-byte floor at which `document-size` is emitted.
 * Seeded constant — not derived from a running document.
 */
export const DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES = 8 * 1024;

/**
 * Minimum time between subsequent `document-size` reports after load.
 * Cadence is wall-clock, never per-commit (SCALE2).
 */
export const DOCUMENT_SIZE_REPORT_INTERVAL_MS = 60_000;

export interface DocumentSizeSnapshot {
	readonly encodedByteSize: number;
	readonly blockCount: number;
	readonly gcEnabled: boolean;
}

const lastDocumentSizeCheckAt = new WeakMap<Y.Doc, number>();

export function measureDocumentSize(ydoc: Y.Doc): DocumentSizeSnapshot {
	return {
		encodedByteSize: Y.encodeStateAsUpdate(ydoc).byteLength,
		blockCount: ydoc.getMap(BLOCKS).size,
		gcEnabled: ydoc.gc,
	};
}

export function isDocumentSizeOverThreshold(encodedByteSize: number): boolean {
	return encodedByteSize >= DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES;
}

/**
 * Whether a later `document-size` report is due.
 * `lastReportedAt` omitted means the load report (always due).
 */
export function isDocumentSizeCadenceDue(
	lastReportedAt: number | undefined,
	now: number,
	intervalMs: number = DOCUMENT_SIZE_REPORT_INTERVAL_MS,
): boolean {
	if (lastReportedAt == null) {
		return true;
	}
	return now - lastReportedAt >= intervalMs;
}

export function documentSizeDiagnosticFields(size: DocumentSizeSnapshot): {
	code: typeof DOCUMENT_SIZE_DIAGNOSTIC_CODE;
	message: string;
	severity: "info";
	encodedByteSize: number;
	blockCount: number;
	gcEnabled: boolean;
	timestamp: number;
} {
	return {
		code: DOCUMENT_SIZE_DIAGNOSTIC_CODE,
		message: `Document is ${size.encodedByteSize} bytes across ${size.blockCount} blocks (gc: ${size.gcEnabled})`,
		severity: "info",
		encodedByteSize: size.encodedByteSize,
		blockCount: size.blockCount,
		gcEnabled: size.gcEnabled,
		timestamp: Date.now(),
	};
}

/** Starts the post-load cadence clock. Create-path documents stay untracked. */
export function rememberDocumentSizeCheck(
	ydoc: Y.Doc,
	at: number = Date.now(),
): void {
	lastDocumentSizeCheckAt.set(ydoc, at);
}

/**
 * After load, sample size at most once per cadence interval.
 * Returns a snapshot only when the sample is due and over the threshold.
 */
export function sampleDocumentSizeIfDue(
	ydoc: Y.Doc,
	now: number = Date.now(),
): DocumentSizeSnapshot | null {
	const last = lastDocumentSizeCheckAt.get(ydoc);
	if (last === undefined) {
		return null;
	}
	if (!isDocumentSizeCadenceDue(last, now)) {
		return null;
	}
	rememberDocumentSizeCheck(ydoc, now);
	const size = measureDocumentSize(ydoc);
	if (!isDocumentSizeOverThreshold(size.encodedByteSize)) {
		return null;
	}
	return size;
}
