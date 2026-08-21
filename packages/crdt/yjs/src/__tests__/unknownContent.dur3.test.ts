import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import type { CRDTDiagnostic } from "../adapter";
import { initBlockMap } from "../document";
import type { YjsCRDTDocument } from "../document";
import { getDocumentLoadReport } from "../loadDocument";
import type { RecoveredMethod } from "../loadDocument";
import { forkDocument } from "../snapshots";

function storedProps(
	doc: YjsCRDTDocument,
	blockId: string,
): Record<string, unknown> {
	const props = doc.penDocument.blocks.get(blockId)?.get("props") as
		| Y.Map<unknown>
		| undefined;
	const result: Record<string, unknown> = {};
	props?.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}

function storedDeltas(doc: YjsCRDTDocument, blockId: string) {
	const content = doc.penDocument.blocks.get(blockId)?.get("content") as
		| Y.Text
		| undefined;
	return content?.toDelta() ?? [];
}

function populateUnknownDocument(
	adapter: ReturnType<typeof yjsAdapter>,
): YjsCRDTDocument {
	const doc = adapter.createDocument() as YjsCRDTDocument;
	adapter.transact(doc, () => {
		initBlockMap(doc.penDocument.blocks, "p1", "paragraph", "inline");
		const paragraph = doc.penDocument.blocks.get("p1")!;
		(paragraph.get("props") as Y.Map<unknown>).set("hostAnnotation", "keep");
		const content = paragraph.get("content") as Y.Text;
		content.insert(0, "Hello world");
		content.format(0, 5, { mysteryMark: "keep", bold: true });

		initBlockMap(doc.penDocument.blocks, "w1", "hostWidget", "inline");
		const widget = doc.penDocument.blocks.get("w1")!;
		(widget.get("props") as Y.Map<unknown>).set("payload", 42);
		(widget.get("content") as Y.Text).insert(0, "widget-body");

		initBlockMap(doc.penDocument.blocks, "n1", "hostLayout", "nested");
		(doc.penDocument.blocks.get("n1")!.get("children") as Y.Array<string>).push([
			"w1",
		]);

		doc.penDocument.blockOrder.push(["p1", "w1", "n1"]);
		doc.penDocument.metadata.set("hostNote", "preserve");
		doc.penDocument.apps.set("hostApp", new Y.Map());
		(doc.penDocument.apps.get("hostApp") as Y.Map<unknown>).set("flag", true);
	});
	return doc;
}

function expectUnknownContentIntact(doc: YjsCRDTDocument): void {
	expect(doc.penDocument.blockOrder.toArray()).toEqual(["p1", "w1", "n1"]);

	expect(doc.penDocument.blocks.get("p1")?.get("type")).toBe("paragraph");
	expect(storedProps(doc, "p1")).toEqual({ hostAnnotation: "keep" });
	expect(storedDeltas(doc, "p1")[0]).toMatchObject({
		insert: "Hello",
		attributes: { mysteryMark: "keep", bold: true },
	});
	expect((doc.penDocument.blocks.get("p1")?.get("content") as Y.Text).toString()).toBe(
		"Hello world",
	);

	expect(doc.penDocument.blocks.get("w1")?.get("type")).toBe("hostWidget");
	expect(storedProps(doc, "w1")).toEqual({ payload: 42 });
	expect(
		(doc.penDocument.blocks.get("w1")?.get("content") as Y.Text).toString(),
	).toBe("widget-body");

	expect(doc.penDocument.blocks.get("n1")?.get("type")).toBe("hostLayout");
	expect(
		(doc.penDocument.blocks.get("n1")?.get("children") as Y.Array<string>).toArray(),
	).toEqual(["w1"]);

	expect(doc.penDocument.metadata.get("hostNote")).toBe("preserve");
	expect(
		(doc.penDocument.apps.get("hostApp") as Y.Map<unknown>).get("flag"),
	).toBe(true);
}

describe("unknown-content preservation (DUR3)", () => {
	it("DUR3: unknown types, props, marks, children, apps, and host metadata survive encode → load → fork", () => {
		const adapter = yjsAdapter();
		const source = populateUnknownDocument(adapter);
		expectUnknownContentIntact(source);

		const loaded = adapter.loadDocument(
			adapter.encodeState(source),
		) as YjsCRDTDocument;
		expect(getDocumentLoadReport(loaded)?.state).toBe("ok");
		expectUnknownContentIntact(loaded);

		const copied = forkDocument(adapter, loaded);
		expectUnknownContentIntact(copied);

		const reloaded = adapter.loadDocument(
			adapter.encodeState(copied),
		) as YjsCRDTDocument;
		expectUnknownContentIntact(reloaded);
	});

	it("DUR3: a repaired load keeps unknown content while naming the structural repair", () => {
		const sourceAdapter = yjsAdapter();
		const source = populateUnknownDocument(sourceAdapter);
		source.ydoc.transact(() => {
			source.penDocument.blockOrder.push(["p1"]);
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
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"DUPLICATE_BLOCK_ORDER",
		]);
		expectUnknownContentIntact(loaded);
	});
});
