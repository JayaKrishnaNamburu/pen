import { describe, expect, it } from "vitest";
import { PEN_FORMAT_METADATA_KEY } from "@input/pen-types";
import { PenDocumentUnreadableError } from "../unreadableError";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import type { CRDTDiagnostic } from "../adapter";
import {
	BLOCKS,
	BLOCK_ORDER,
	createYjsDocument,
	initBlockMap,
} from "../document";
import { getDocumentLoadReport } from "../loadDocument";
import type { RecoveredMethod } from "../loadDocument";
import type { YjsCRDTDocument } from "../document";

describe("loadDocument (DUR2)", () => {
	it("DUR2: ok loads a well-formed document with no diagnostics", () => {
		const diagnostics: CRDTDiagnostic[] = [];
		const recovered: RecoveredMethod[] = [];
		const adapter = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			onRecovered: (method) => recovered.push(method),
		});
		const doc = adapter.createDocument() as YjsCRDTDocument;
		adapter.transact(doc, () => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const loaded = adapter.loadDocument(adapter.encodeState(doc));
		const report = getDocumentLoadReport(loaded);

		expect(report?.state).toBe("ok");
		expect(report?.diagnostics).toEqual([]);
		expect(diagnostics).toEqual([]);
		expect(recovered).toEqual([]);
		expect(
			(loaded as YjsCRDTDocument).penDocument.blockOrder.toArray(),
		).toEqual(["b1"]);
	});

	it("DUR2: repaired dedupes blockOrder and names each repair", () => {
		const diagnostics: CRDTDiagnostic[] = [];
		const recovered: RecoveredMethod[] = [];
		const adapter = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			onRecovered: (method) => recovered.push(method),
		});
		const source = adapter.createDocument() as YjsCRDTDocument;
		source.ydoc.transact(() => {
			initBlockMap(
				source.penDocument.blocks,
				"b1",
				"paragraph",
				"inline",
			);
			source.penDocument.blockOrder.push(["b1", "b1"]);
		});

		const loaded = adapter.loadDocument(
			adapter.encodeState(source),
		) as YjsCRDTDocument;
		const report = getDocumentLoadReport(loaded);

		expect(report?.state).toBe("repaired");
		expect(recovered).toEqual(["repair"]);
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"DUPLICATE_BLOCK_ORDER",
		]);
		expect(diagnostics[0]?.message).toContain("b1");
		expect(loaded.penDocument.blockOrder.toArray()).toEqual(["b1"]);
	});

	it("DUR2: unreadable throws when minReader exceeds the reader format", () => {
		const adapter = yjsAdapter();
		const source = createYjsDocument(adapter);
		source.ydoc.transact(() => {
			source.penDocument.metadata.set(PEN_FORMAT_METADATA_KEY, {
				format: 99,
				minReader: 99,
				writer: "future",
			});
		});

		try {
			adapter.loadDocument(adapter.encodeState(source));
			expect.unreachable("expected PenDocumentUnreadableError");
		} catch (error) {
			expect(error).toBeInstanceOf(PenDocumentUnreadableError);
			const unreadable = error as PenDocumentUnreadableError;
			expect(unreadable.stamp.minReader).toBe(99);
			expect(unreadable.reason).toContain("minReader");
			expect(unreadable.stamp.format).toBe(99);
		}
	});

	it("DUR2: unreadable throws when a shared type has the wrong Yjs constructor", () => {
		const adapter = yjsAdapter();
		const ydoc = new Y.Doc();
		// empty getArray/getMap writes nothing into the update; the mismatch
		// only survives encode when the wrong type actually holds content
		ydoc.getArray(BLOCKS).push(["not-a-block-map"]);
		ydoc.getArray(BLOCK_ORDER).push(["b1"]);
		ydoc.getMap("apps").set("k", 1);
		ydoc.getMap("metadata").set("k", 1);

		try {
			adapter.loadDocument(Y.encodeStateAsUpdate(ydoc));
			expect.unreachable("expected PenDocumentUnreadableError");
		} catch (error) {
			expect(error).toBeInstanceOf(PenDocumentUnreadableError);
			const unreadable = error as PenDocumentUnreadableError;
			expect(unreadable.reason).toContain("blocks");
			expect(unreadable.stamp.format).toBe(1);
			expect(unreadable.stamp.minReader).toBe(1);
		}
	});

	it("DUR2: repair: false leaves duplicate order in place and does not recover", () => {
		const recovered: RecoveredMethod[] = [];
		const adapter = yjsAdapter({
			onRecovered: (method) => recovered.push(method),
		});
		const source = adapter.createDocument() as YjsCRDTDocument;
		source.ydoc.transact(() => {
			initBlockMap(
				source.penDocument.blocks,
				"b1",
				"paragraph",
				"inline",
			);
			source.penDocument.blockOrder.push(["b1", "b1"]);
		});

		const loaded = adapter.loadDocument(adapter.encodeState(source), {
			repair: false,
		}) as YjsCRDTDocument;

		expect(getDocumentLoadReport(loaded)?.state).toBe("ok");
		expect(recovered).toEqual([]);
		expect(loaded.penDocument.blockOrder.toArray()).toEqual(["b1", "b1"]);
	});
});
