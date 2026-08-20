import { describe, expect, it } from "vitest";
import {
	PEN_DOCUMENT_FORMAT,
	PEN_FORMAT_METADATA_KEY,
	PenDocumentUnreadableError,
} from "@input/pen-types";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import type { CRDTDiagnostic } from "../adapter";
import {
	APPS,
	BLOCK_ORDER,
	BLOCKS,
	METADATA,
	initBlockMap,
} from "../document";
import type { YjsCRDTDocument } from "../document";
import { getDocumentLoadReport } from "../loadDocument";
import type { RecoveredMethod } from "../loadDocument";

describe("load leftovers (DUR2)", () => {
	it("DUR2: ok load has no diagnostics and does not emit recovery", () => {
		const source = yjsAdapter();
		const diagnostics: CRDTDiagnostic[] = [];
		const recovered: RecoveredMethod[] = [];
		const loader = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			onRecovered: (method) => recovered.push(method),
		});

		const loaded = loader.loadDocument(
			source.encodeState(source.createDocument()),
		);

		expect(getDocumentLoadReport(loaded)?.state).toBe("ok");
		expect(diagnostics).toEqual([]);
		expect(recovered).toEqual([]);
	});

	it("DUR2: repaired load names each repair and emits recovery", () => {
		const source = yjsAdapter();
		const doc = source.createDocument() as YjsCRDTDocument;
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1", "b1"]);
		});

		const diagnostics: CRDTDiagnostic[] = [];
		const recovered: RecoveredMethod[] = [];
		const loader = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			onRecovered: (method) => recovered.push(method),
		});
		const loaded = loader.loadDocument(source.encodeState(doc)) as YjsCRDTDocument;

		expect(getDocumentLoadReport(loaded)?.state).toBe("repaired");
		expect(recovered).toEqual(["repair"]);
		expect(diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "DUPLICATE_BLOCK_ORDER",
					message: expect.stringContaining("b1"),
				}),
			]),
		);
		expect(loaded.penDocument.blockOrder.toArray()).toEqual(["b1"]);
	});

	it("DUR2: minReader above the reader format throws PenDocumentUnreadableError", () => {
		const source = yjsAdapter();
		const doc = source.createDocument() as YjsCRDTDocument;
		const stamp = {
			format: PEN_DOCUMENT_FORMAT + 1,
			minReader: PEN_DOCUMENT_FORMAT + 1,
			writer: "future",
		};
		doc.ydoc.transact(() => {
			doc.penDocument.metadata.set(PEN_FORMAT_METADATA_KEY, stamp);
		});

		try {
			source.loadDocument(source.encodeState(doc));
			expect.unreachable("expected PenDocumentUnreadableError");
		} catch (error) {
			expect(error).toBeInstanceOf(PenDocumentUnreadableError);
			if (!(error instanceof PenDocumentUnreadableError)) {
				return;
			}
			expect(error.stamp).toEqual(stamp);
			expect(error.reason).toContain(
				`minReader ${stamp.minReader} exceeds reader format ${PEN_DOCUMENT_FORMAT}`,
			);
		}
	});

	it("DUR2: minReader equal to PEN_DOCUMENT_FORMAT still loads", () => {
		const source = yjsAdapter();
		const doc = source.createDocument() as YjsCRDTDocument;
		doc.ydoc.transact(() => {
			doc.penDocument.metadata.set(PEN_FORMAT_METADATA_KEY, {
				format: PEN_DOCUMENT_FORMAT,
				minReader: PEN_DOCUMENT_FORMAT,
				writer: "edge",
			});
		});

		const loaded = source.loadDocument(source.encodeState(doc));
		expect(getDocumentLoadReport(loaded)?.state).toBe("ok");
	});

	it("DUR2: a wrong-typed shared root throws PenDocumentUnreadableError", () => {
		const ydoc = new Y.Doc();
		ydoc.getMap(BLOCK_ORDER).set("not-an-array", 1);
		ydoc.getMap(BLOCKS).set("b1", new Y.Map());
		ydoc.getMap(APPS).set("keep", 1);
		ydoc.getMap(METADATA).set("keep", 1);

		try {
			yjsAdapter().loadDocument(Y.encodeStateAsUpdate(ydoc));
			expect.unreachable("expected PenDocumentUnreadableError");
		} catch (error) {
			expect(error).toBeInstanceOf(PenDocumentUnreadableError);
			if (!(error instanceof PenDocumentUnreadableError)) {
				return;
			}
			expect(error.reason).toContain("blockOrder");
			expect(error.stamp).toEqual({
				format: 1,
				minReader: 1,
				writer: "unknown",
			});
		}
	});
});
