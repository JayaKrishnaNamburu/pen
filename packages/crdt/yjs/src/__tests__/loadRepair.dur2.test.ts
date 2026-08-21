import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import type { CRDTDiagnostic } from "../adapter";
import { initBlockMap } from "../document";
import type { YjsCRDTDocument } from "../document";
import { getDocumentLoadReport } from "../loadDocument";
import type { RecoveredMethod } from "../loadDocument";

function seedParagraph(
	adapter: ReturnType<typeof yjsAdapter>,
	blockId: string,
	text: string,
): YjsCRDTDocument {
	const doc = adapter.createDocument() as YjsCRDTDocument;
	adapter.transact(doc, () => {
		initBlockMap(doc.penDocument.blocks, blockId, "paragraph", "inline");
		doc.penDocument.blockOrder.push([blockId]);
		(doc.penDocument.blocks.get(blockId)!.get("content") as Y.Text).insert(
			0,
			text,
		);
	});
	return doc;
}

describe("load-path repairs (DUR2)", () => {
	it("DUR2: dangling blockOrder entry loads repaired, is removed, and emits recovery", () => {
		const sourceAdapter = yjsAdapter();
		const source = seedParagraph(sourceAdapter, "b1", "keep-me");
		source.ydoc.transact(() => {
			source.penDocument.blockOrder.push(["ghost"]);
		});

		const diagnostics: CRDTDiagnostic[] = [];
		const recovered: RecoveredMethod[] = [];
		const loader = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			onRecovered: (method) => recovered.push(method),
		});
		const loaded = loader.loadDocument(
			sourceAdapter.encodeState(source),
		) as YjsCRDTDocument;

		expect(getDocumentLoadReport(loaded)?.state).toBe("repaired");
		expect(recovered).toEqual(["repair"]);
		expect(diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "ORPHAN_BLOCK",
					message: expect.stringContaining("ghost"),
				}),
			]),
		);
		expect(loaded.penDocument.blockOrder.toArray()).toEqual(["b1"]);
		expect(loaded.penDocument.blocks.has("ghost")).toBe(false);
		expect(
			(loaded.penDocument.blocks.get("b1")?.get("content") as Y.Text).toString(),
		).toBe("keep-me");
	});

	it("DUR2: orphan block loads repaired, is reattached, and emits recovery", () => {
		const sourceAdapter = yjsAdapter();
		const source = seedParagraph(sourceAdapter, "b1", "visible");
		source.ydoc.transact(() => {
			initBlockMap(source.penDocument.blocks, "orphan", "hostWidget", "inline");
			(source.penDocument.blocks.get("orphan")!.get("props") as Y.Map<unknown>).set(
				"payload",
				"kept",
			);
			(source.penDocument.blocks.get("orphan")!.get("content") as Y.Text).insert(
				0,
				"orphan-body",
			);
		});

		const diagnostics: CRDTDiagnostic[] = [];
		const recovered: RecoveredMethod[] = [];
		const loader = yjsAdapter({
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
			onRecovered: (method) => recovered.push(method),
		});
		const loaded = loader.loadDocument(
			sourceAdapter.encodeState(source),
		) as YjsCRDTDocument;

		expect(getDocumentLoadReport(loaded)?.state).toBe("repaired");
		expect(recovered).toEqual(["repair"]);
		expect(diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "ORPHAN_BLOCK",
					message: expect.stringContaining("orphan"),
				}),
			]),
		);
		expect(loaded.penDocument.blockOrder.toArray()).toEqual(["b1", "orphan"]);
		expect(loaded.penDocument.blocks.get("orphan")?.get("type")).toBe(
			"hostWidget",
		);
		expect(
			(
				loaded.penDocument.blocks.get("orphan")?.get("props") as Y.Map<unknown>
			).get("payload"),
		).toBe("kept");
		expect(
			(loaded.penDocument.blocks.get("orphan")?.get("content") as Y.Text).toString(),
		).toBe("orphan-body");
		expect(
			(loaded.penDocument.blocks.get("b1")?.get("content") as Y.Text).toString(),
		).toBe("visible");
	});
});
