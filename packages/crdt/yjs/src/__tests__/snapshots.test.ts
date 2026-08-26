import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import { SUBDOCUMENT, createYjsDocument, initBlockMap } from "../document";
import {
	createYjsSnapshot,
	forkDocument,
	mergeDocuments,
	mergeYjsUpdates,
	restoreYjsSnapshot,
} from "../snapshots";

describe("snapshots", () => {
	const adapter = yjsAdapter({ gc: false });

	describe("createSnapshot / restoreSnapshot", () => {
		it("restores document to snapshot state", () => {
			const doc = createYjsDocument(adapter, { gc: false });
			doc.ydoc.transact(() => {
				initBlockMap(
					doc.penDocument.blocks,
					"b1",
					"paragraph",
					"inline",
				);
				doc.penDocument.blockOrder.push(["b1"]);
			});

			const block = doc.penDocument.blocks.get("b1")!;
			const ytext = block.get("content") as Y.Text;
			doc.ydoc.transact(() => {
				ytext.insert(0, "Snapshot state");
			});

			const snapshot = createYjsSnapshot(doc);

			doc.ydoc.transact(() => {
				ytext.insert(14, " + more");
			});

			const restored = restoreYjsSnapshot(adapter, doc, snapshot);
			const restoredBlock = restored.penDocument.blocks.get("b1")!;
			const restoredText = restoredBlock.get("content") as Y.Text;
			expect(restoredText.toString()).toBe("Snapshot state");
		});

		it("restores nested subdocument content with the root snapshot", () => {
			const doc = createYjsDocument(adapter, { gc: false });
			doc.ydoc.transact(() => {
				initBlockMap(
					doc.penDocument.blocks,
					"subdoc",
					"subdocument",
					"subdocument",
				);
				doc.penDocument.blockOrder.push(["subdoc"]);
			});

			const subdocBlock = doc.penDocument.blocks.get("subdoc")!;
			const subdoc = subdocBlock.get(SUBDOCUMENT) as Y.Doc;
			const subdocBlocks = subdoc.getMap<Y.Map<unknown>>("blocks");
			const subdocOrder = subdoc.getArray<string>("blockOrder");
			subdoc.transact(() => {
				initBlockMap(subdocBlocks, "nested-1", "paragraph", "inline");
				subdocOrder.push(["nested-1"]);
				const content = subdocBlocks
					.get("nested-1")
					?.get("content") as Y.Text;
				content.insert(0, "Nested snapshot state");
			});

			const snapshot = createYjsSnapshot(doc);

			subdoc.transact(() => {
				const content = subdocBlocks
					.get("nested-1")
					?.get("content") as Y.Text;
				content.delete(0, content.length);
				content.insert(0, "Nested updated state");
			});

			const restored = restoreYjsSnapshot(adapter, doc, snapshot);
			const restoredSubdocBlock =
				restored.penDocument.blocks.get("subdoc")!;
			const restoredSubdoc = restoredSubdocBlock.get(
				SUBDOCUMENT,
			) as Y.Doc;
			const restoredSubdocBlocks =
				restoredSubdoc.getMap<Y.Map<unknown>>("blocks");
			const restoredText = restoredSubdocBlocks
				.get("nested-1")
				?.get("content") as Y.Text;

			expect(restoredText.toString()).toBe("Nested snapshot state");
		});
	});

	describe("mergeYjsUpdates", () => {
		it("compacts multiple updates into one", () => {
			const docA = createYjsDocument(adapter);
			docA.ydoc.clientID = 1;
			docA.ydoc.transact(() => {
				docA.penDocument.blockOrder.push(["b1"]);
			});
			const updateA = Y.encodeStateAsUpdate(docA.ydoc);

			const docB = createYjsDocument(adapter);
			docB.ydoc.clientID = 2;
			docB.ydoc.transact(() => {
				docB.penDocument.blockOrder.push(["b2"]);
			});
			const updateB = Y.encodeStateAsUpdate(docB.ydoc);

			const onlyA = new Y.Doc();
			Y.applyUpdate(onlyA, updateA);
			expect(onlyA.getArray("blockOrder").toArray()).toEqual(["b1"]);

			const onlyB = new Y.Doc();
			Y.applyUpdate(onlyB, updateB);
			expect(onlyB.getArray("blockOrder").toArray()).toEqual(["b2"]);

			const merged = mergeYjsUpdates([updateA, updateB]);
			const freshDoc = new Y.Doc();
			Y.applyUpdate(freshDoc, merged);
			expect(freshDoc.getArray("blockOrder").toArray().sort()).toEqual([
				"b1",
				"b2",
			]);
		});
	});

	describe("forkDocument", () => {
		it("creates an independent copy with different clientID", () => {
			const doc = createYjsDocument(adapter);
			doc.ydoc.transact(() => {
				initBlockMap(
					doc.penDocument.blocks,
					"b1",
					"paragraph",
					"inline",
				);
				doc.penDocument.blockOrder.push(["b1"]);
			});

			const forked = forkDocument(adapter, doc);
			expect(forked.ydoc.clientID).not.toBe(doc.ydoc.clientID);
			expect(forked.penDocument.blockOrder.toArray()).toEqual(["b1"]);
		});

		it("preserves gc: false on fork", () => {
			const doc = createYjsDocument(adapter, { gc: false });
			const forked = forkDocument(adapter, doc);
			expect(forked.ydoc.gc).toBe(false);
		});
	});

	describe("mergeDocuments", () => {
		it("merges fork changes back to target", () => {
			const doc = createYjsDocument(adapter);
			doc.ydoc.transact(() => {
				initBlockMap(
					doc.penDocument.blocks,
					"b1",
					"paragraph",
					"inline",
				);
				doc.penDocument.blockOrder.push(["b1"]);
			});

			const forked = forkDocument(adapter, doc);
			forked.ydoc.transact(() => {
				initBlockMap(
					forked.penDocument.blocks,
					"b2",
					"heading",
					"inline",
				);
				forked.penDocument.blockOrder.push(["b2"]);
			});

			mergeDocuments(doc, forked);
			expect(doc.penDocument.blockOrder.toArray()).toEqual(["b1", "b2"]);
			expect(doc.penDocument.blocks.has("b2")).toBe(true);
		});

		it("merge is idempotent", () => {
			const doc = createYjsDocument(adapter);
			doc.ydoc.transact(() => {
				doc.penDocument.blockOrder.push(["b1"]);
			});

			const forked = forkDocument(adapter, doc);
			forked.ydoc.transact(() => {
				forked.penDocument.blockOrder.push(["b2"]);
			});

			mergeDocuments(doc, forked);
			const state1 = Y.encodeStateAsUpdate(doc.ydoc);

			mergeDocuments(doc, forked);
			const state2 = Y.encodeStateAsUpdate(doc.ydoc);

			expect(state1).toEqual(state2);
		});
	});
});
