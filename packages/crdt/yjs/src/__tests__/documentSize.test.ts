import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import type { CRDTDiagnostic } from "../adapter";
import { initBlockMap } from "../document";
import type { YjsCRDTDocument } from "../document";
import {
	DOCUMENT_SIZE_DIAGNOSTIC_CODE,
	DOCUMENT_SIZE_REPORT_INTERVAL_MS,
	DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES,
	isDocumentSizeCadenceDue,
} from "../documentSize";
import { getDocumentLoadReport } from "../loadDocument";

function fillOverThreshold(doc: YjsCRDTDocument, blockId: string): void {
	const text = doc.penDocument.blocks.get(blockId)!.get("content") as Y.Text;
	text.insert(0, "x".repeat(DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES));
}

describe("document-size diagnostic (DUR6 / V.6)", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("DUR6 / V.6: fires on load of a large-enough fixture with encoded size, block count, and gc", () => {
		const diagnostics: CRDTDiagnostic[] = [];
		const adapter = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});
		const source = adapter.createDocument() as YjsCRDTDocument;
		adapter.transact(source, () => {
			initBlockMap(
				source.penDocument.blocks,
				"b1",
				"paragraph",
				"inline",
			);
			source.penDocument.blockOrder.push(["b1"]);
			fillOverThreshold(source, "b1");
		});

		const encoded = adapter.encodeState(source);
		expect(encoded.byteLength).toBeGreaterThanOrEqual(
			DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES,
		);

		const loaded = adapter.loadDocument(encoded);
		const report = getDocumentLoadReport(loaded);
		const sizeDiagnostics = diagnostics.filter(
			(diagnostic) => diagnostic.code === DOCUMENT_SIZE_DIAGNOSTIC_CODE,
		);

		expect(sizeDiagnostics).toHaveLength(1);
		expect(sizeDiagnostics[0]?.severity).toBe("info");
		expect(sizeDiagnostics[0]?.encodedByteSize).toBeGreaterThanOrEqual(
			DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES,
		);
		expect(sizeDiagnostics[0]?.blockCount).toBe(1);
		expect(sizeDiagnostics[0]?.gcEnabled).toBe(false);
		expect(sizeDiagnostics[0]?.message).toContain("bytes");
		expect(report?.diagnostics).toEqual(sizeDiagnostics);
	});

	it("DUR6 / V.6: reports gcEnabled when the adapter loads with gc: true", () => {
		const diagnostics: CRDTDiagnostic[] = [];
		const adapter = yjsAdapter({
			gc: true,
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});
		const source = adapter.createDocument() as YjsCRDTDocument;
		adapter.transact(source, () => {
			initBlockMap(
				source.penDocument.blocks,
				"b1",
				"paragraph",
				"inline",
			);
			source.penDocument.blockOrder.push(["b1"]);
			fillOverThreshold(source, "b1");
		});

		adapter.loadDocument(adapter.encodeState(source));
		expect(diagnostics[0]?.code).toBe(DOCUMENT_SIZE_DIAGNOSTIC_CODE);
		expect(diagnostics[0]?.gcEnabled).toBe(true);
	});

	it("DUR6 / V.6: does not fire from a tiny in-memory create", () => {
		const diagnostics: CRDTDiagnostic[] = [];
		const adapter = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});

		const created = adapter.createDocument() as YjsCRDTDocument;
		expect(adapter.encodeState(created).byteLength).toBeLessThan(
			DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES,
		);
		expect(
			diagnostics.filter(
				(diagnostic) =>
					diagnostic.code === DOCUMENT_SIZE_DIAGNOSTIC_CODE,
			),
		).toEqual([]);
	});

	it("DUR6 / V.6: does not fire per commit, including a large in-memory edit", () => {
		const diagnostics: CRDTDiagnostic[] = [];
		const adapter = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});
		const doc = adapter.createDocument() as YjsCRDTDocument;
		adapter.transact(doc, () => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
			fillOverThreshold(doc, "b1");
		});

		expect(adapter.encodeState(doc).byteLength).toBeGreaterThanOrEqual(
			DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES,
		);
		expect(
			diagnostics.filter(
				(diagnostic) =>
					diagnostic.code === DOCUMENT_SIZE_DIAGNOSTIC_CODE,
			),
		).toEqual([]);
	});

	it("DUR6 / V.6: cadence is wall-clock, not a commit counter", () => {
		const interval = DOCUMENT_SIZE_REPORT_INTERVAL_MS;
		expect(isDocumentSizeCadenceDue(undefined, 0)).toBe(true);
		expect(isDocumentSizeCadenceDue(1_000, 1_000 + interval - 1)).toBe(
			false,
		);
		expect(isDocumentSizeCadenceDue(1_000, 1_000 + interval)).toBe(true);

		let commits = 0;
		const lastReportedAt = 5_000;
		for (let index = 0; index < 50; index++) {
			commits += 1;
			expect(
				isDocumentSizeCadenceDue(lastReportedAt, lastReportedAt + 1),
			).toBe(false);
		}
		expect(commits).toBe(50);
	});

	it("DUR6 / V.6: after load, a later write emits again only when the cadence elapses", () => {
		vi.useFakeTimers();
		vi.setSystemTime(10_000);

		const diagnostics: CRDTDiagnostic[] = [];
		const adapter = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});
		const source = adapter.createDocument() as YjsCRDTDocument;
		adapter.transact(source, () => {
			initBlockMap(
				source.penDocument.blocks,
				"b1",
				"paragraph",
				"inline",
			);
			source.penDocument.blockOrder.push(["b1"]);
			fillOverThreshold(source, "b1");
		});

		const loaded = adapter.loadDocument(
			adapter.encodeState(source),
		) as YjsCRDTDocument;
		expect(
			diagnostics.filter(
				(diagnostic) =>
					diagnostic.code === DOCUMENT_SIZE_DIAGNOSTIC_CODE,
			),
		).toHaveLength(1);

		adapter.transact(loaded, () => {
			(
				loaded.penDocument.blocks.get("b1")!.get("content") as Y.Text
			).insert(0, "!");
		});
		expect(
			diagnostics.filter(
				(diagnostic) =>
					diagnostic.code === DOCUMENT_SIZE_DIAGNOSTIC_CODE,
			),
		).toHaveLength(1);

		vi.setSystemTime(10_000 + DOCUMENT_SIZE_REPORT_INTERVAL_MS);
		adapter.transact(loaded, () => {
			(
				loaded.penDocument.blocks.get("b1")!.get("content") as Y.Text
			).insert(0, "?");
		});

		const sizeDiagnostics = diagnostics.filter(
			(diagnostic) => diagnostic.code === DOCUMENT_SIZE_DIAGNOSTIC_CODE,
		);
		expect(sizeDiagnostics).toHaveLength(2);
		expect(sizeDiagnostics[1]?.encodedByteSize).toBeGreaterThanOrEqual(
			DOCUMENT_SIZE_REPORT_THRESHOLD_BYTES,
		);
		expect(sizeDiagnostics[1]?.blockCount).toBe(1);
		expect(sizeDiagnostics[1]?.gcEnabled).toBe(false);
	});
});
