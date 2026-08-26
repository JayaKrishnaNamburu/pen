import {
	PEN_DOCUMENT_FORMAT,
	type CRDTAdapter,
	type CRDTDocument,
} from "@input/pen-types";
import * as Y from "yjs";
import { PenDocumentUnreadableError } from "./unreadableError";

import {
	APPS,
	BLOCK_ORDER,
	BLOCKS,
	METADATA,
	validateDocument,
	wrapYjsDocument,
} from "./document";
import type { DocumentValidationError, YjsCRDTDocument } from "./document";
import {
	documentSizeDiagnosticFields,
	isDocumentSizeOverThreshold,
	measureDocumentSize,
	rememberDocumentSizeCheck,
} from "./documentSize";
import { readFormatStampFromYDoc } from "./formatStamp";

export interface CRDTDiagnostic {
	code: string;
	message: string;
	severity: "error" | "warning" | "info";
	updateSize?: number;
	encodedByteSize?: number;
	blockCount?: number;
	gcEnabled?: boolean;
	timestamp: number;
}

export type DocumentLoadState = "ok" | "repaired";

export interface DocumentLoadReport {
	readonly state: DocumentLoadState;
	readonly diagnostics: readonly CRDTDiagnostic[];
	readonly strippedSentinelCount?: number;
}

export type RecoveredMethod = "repair";

type SharedKind = "array" | "map" | "unbound";

interface SharedTypePeek {
	_start: unknown;
	_map?: Map<string, unknown>;
}

const EXPECTED_SHARED_KINDS: Array<
	[string, Exclude<SharedKind, "unbound">, string]
> = [
	[BLOCK_ORDER, "array", "YArray"],
	[BLOCKS, "map", "YMap"],
	[APPS, "map", "YMap"],
	[METADATA, "map", "YMap"],
];

const loadReports = new WeakMap<Y.Doc, DocumentLoadReport>();

export function getDocumentLoadReport(
	doc: CRDTDocument,
): DocumentLoadReport | undefined {
	const ydoc = (doc as YjsCRDTDocument).ydoc;
	if (!(ydoc instanceof Y.Doc)) {
		return undefined;
	}
	return loadReports.get(ydoc);
}

export function recordDocumentLoadMigration(
	doc: CRDTDocument,
	fields: { strippedSentinelCount: number },
): void {
	const ydoc = (doc as YjsCRDTDocument).ydoc;
	if (!(ydoc instanceof Y.Doc)) {
		return;
	}
	const previous = loadReports.get(ydoc) ?? {
		state: "ok" as const,
		diagnostics: [],
	};
	loadReports.set(ydoc, {
		...previous,
		strippedSentinelCount: fields.strippedSentinelCount,
	});
}

function peekSharedKind(ydoc: Y.Doc, name: string): SharedKind {
	if (!ydoc.share.has(name)) {
		return "unbound";
	}
	// After applyUpdate, share holds AbstractType until the first getArray/getMap
	// binds a constructor. Peek the list-vs-map shape instead of calling get*,
	// because getMap on an array-shaped type "succeeds" and hides the mismatch.
	const type = ydoc.share.get(name) as SharedTypePeek | undefined;
	if (type?._start != null) {
		return "array";
	}
	if (type?._map && type._map.size > 0) {
		return "map";
	}
	return "unbound";
}

function wrongSharedTypeReason(ydoc: Y.Doc): string | null {
	for (const [name, expected, expectedName] of EXPECTED_SHARED_KINDS) {
		const kind = peekSharedKind(ydoc, name);
		if (kind !== "unbound" && kind !== expected) {
			return `Shared type '${name}' exists but is not a ${expectedName}`;
		}
	}
	return null;
}

function toDiagnostic(error: DocumentValidationError): CRDTDiagnostic {
	return {
		code: error.code,
		message: error.message,
		severity: error.severity,
		timestamp: Date.now(),
	};
}

function maybeEmitDocumentSize(
	ydoc: Y.Doc,
	diagnostics: CRDTDiagnostic[],
	emitDiagnostic: (diagnostic: CRDTDiagnostic) => void,
): void {
	const size = measureDocumentSize(ydoc);
	if (!isDocumentSizeOverThreshold(size.encodedByteSize)) {
		return;
	}
	const diagnostic: CRDTDiagnostic = documentSizeDiagnosticFields(size);
	diagnostics.push(diagnostic);
	emitDiagnostic(diagnostic);
}

export function loadYjsDocument(
	adapter: CRDTAdapter,
	binary: Uint8Array,
	options?: {
		gc?: boolean;
		repair?: boolean;
		onDiagnostic?: (diagnostic: CRDTDiagnostic) => void;
		onRecovered?: (method: RecoveredMethod) => void;
	},
): YjsCRDTDocument {
	const emitDiagnostic = options?.onDiagnostic ?? (() => {});
	const ydoc = new Y.Doc({ gc: options?.gc ?? false });
	Y.applyUpdate(ydoc, binary);

	const typeReason = wrongSharedTypeReason(ydoc);
	const stamp = readFormatStampFromYDoc(ydoc);
	if (typeReason) {
		throw new PenDocumentUnreadableError(stamp, typeReason);
	}
	if (stamp.minReader > PEN_DOCUMENT_FORMAT) {
		throw new PenDocumentUnreadableError(
			stamp,
			`minReader ${stamp.minReader} exceeds reader format ${PEN_DOCUMENT_FORMAT}`,
		);
	}

	const doc = wrapYjsDocument(adapter, ydoc);
	const repair = options?.repair !== false;
	const validation = validateDocument(ydoc, { repair });
	const diagnostics: CRDTDiagnostic[] = [];

	for (const error of validation.errors) {
		const diagnostic = toDiagnostic(error);
		diagnostics.push(diagnostic);
		emitDiagnostic(diagnostic);
	}

	maybeEmitDocumentSize(ydoc, diagnostics, emitDiagnostic);
	rememberDocumentSizeCheck(ydoc);

	if (validation.repaired) {
		loadReports.set(ydoc, { state: "repaired", diagnostics });
		options?.onRecovered?.("repair");
		return doc;
	}

	loadReports.set(ydoc, { state: "ok", diagnostics });
	return doc;
}
