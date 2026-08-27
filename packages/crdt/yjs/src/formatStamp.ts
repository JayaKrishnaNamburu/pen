import type { CRDTDocument, PenFormatStamp } from "@input/pen-types";
import {
	IMPLICIT_V1_FORMAT_STAMP,
	PEN_DOCUMENT_FORMAT,
	PEN_FORMAT_METADATA_KEY,
} from "@input/pen-types";
import * as Y from "yjs";

import { asYjsDoc, METADATA } from "./document";
import type { YjsCRDTDocument } from "./document";

/**
 * Semver of `@input/pen-yjs`, the library that writes the stamp (DUR1).
 * Keep in lockstep with this package's `package.json` version.
 */
const WRITER_VERSION = "0.0.1";

function currentStamp(): PenFormatStamp {
	return {
		format: PEN_DOCUMENT_FORMAT,
		minReader: 1,
		writer: WRITER_VERSION,
	};
}

function implicitV1Stamp(): PenFormatStamp {
	return {
		format: IMPLICIT_V1_FORMAT_STAMP.format,
		minReader: IMPLICIT_V1_FORMAT_STAMP.minReader,
		writer: IMPLICIT_V1_FORMAT_STAMP.writer,
	};
}

function parseFormatStamp(value: unknown): PenFormatStamp {
	if (!isPenFormatStamp(value)) {
		return implicitV1Stamp();
	}
	return {
		format: value.format,
		minReader: value.minReader,
		writer: value.writer,
	};
}

function isPenFormatStamp(value: unknown): value is PenFormatStamp {
	if (value == null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const stamp = value as Record<string, unknown>;
	return (
		typeof stamp.format === "number" &&
		Number.isFinite(stamp.format) &&
		typeof stamp.minReader === "number" &&
		Number.isFinite(stamp.minReader) &&
		typeof stamp.writer === "string"
	);
}

function stampsEqual(left: PenFormatStamp, right: PenFormatStamp): boolean {
	return (
		left.format === right.format &&
		left.minReader === right.minReader &&
		left.writer === right.writer
	);
}

function writeFormatStamp(doc: YjsCRDTDocument, stamp: PenFormatStamp): void {
	doc.ydoc.transact(() => {
		doc.penDocument.metadata.set(PEN_FORMAT_METADATA_KEY, {
			format: stamp.format,
			minReader: stamp.minReader,
			writer: stamp.writer,
		});
	}, "system");
}

/**
 * Reads the store-generation stamp. Missing or malformed values are v1-by-absence
 * (`{ format: 1, minReader: 1, writer: "unknown" }`), not an error (DUR1).
 */
export function readFormatStamp(doc: CRDTDocument): PenFormatStamp {
	return parseFormatStamp(
		asYjsDoc(doc).penDocument.metadata.get(PEN_FORMAT_METADATA_KEY),
	);
}

export function readFormatStampFromYDoc(ydoc: Y.Doc): PenFormatStamp {
	if (!ydoc.share.has(METADATA)) {
		return implicitV1Stamp();
	}
	try {
		const metadata = ydoc.getMap(METADATA);
		return parseFormatStamp(metadata.get(PEN_FORMAT_METADATA_KEY));
	} catch {
		// missing or wrong-typed metadata map; treat as implicit v1.
		return implicitV1Stamp();
	}
}

/**
 * Writes the current stamp when the stored one is absent or stale.
 * Creation and the first write of a session both go through this; a no-op when
 * the stamp already matches so a freshly created document does not emit a
 * second transaction on its first user write.
 */
export function refreshFormatStamp(doc: CRDTDocument): void {
	const next = currentStamp();
	if (stampsEqual(readFormatStamp(doc), next)) {
		return;
	}
	writeFormatStamp(asYjsDoc(doc), next);
}
