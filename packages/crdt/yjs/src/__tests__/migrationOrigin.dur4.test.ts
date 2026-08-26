import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import { initBlockMap } from "../document";
import type { YjsCRDTDocument } from "../document";
import { createYjsUndoManager } from "../undo";

function seedParagraph(
	adapter: ReturnType<typeof yjsAdapter>,
): YjsCRDTDocument {
	const doc = adapter.createDocument() as YjsCRDTDocument;
	adapter.transact(doc, () => {
		initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
		doc.penDocument.blockOrder.push(["b1"]);
	});
	return doc;
}

describe("migration origin (DUR4)", () => {
	it("DUR4: default undo manager does not capture adapter writes with origin migration", () => {
		const adapter = yjsAdapter();
		const doc = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const ytext = doc.penDocument.blocks
			.get("b1")!
			.get("content") as Y.Text;

		adapter.transact(
			doc,
			() => {
				ytext.insert(0, "upgraded");
			},
			"migration",
		);

		expect(ytext.toString()).toBe("upgraded");
		expect(undo.canUndo()).toBe(false);

		adapter.transact(
			doc,
			() => {
				ytext.insert(8, " later");
			},
			"user",
		);

		expect(ytext.toString()).toBe("upgraded later");
		expect(undo.canUndo()).toBe(true);
		expect(undo.undo()).toBe(true);
		expect(ytext.toString()).toBe("upgraded");
		expect(undo.canUndo()).toBe(false);
	});

	it("DUR4: a raw Yjs transaction tagged migration is also excluded from undo", () => {
		const adapter = yjsAdapter();
		const doc = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const ytext = doc.penDocument.blocks
			.get("b1")!
			.get("content") as Y.Text;

		doc.ydoc.transact(() => {
			ytext.insert(0, "schema-bump");
		}, "migration");

		expect(ytext.toString()).toBe("schema-bump");
		expect(undo.canUndo()).toBe(false);
	});
});
