import { readFileSync } from "node:fs";

import type { CRDTEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import { createYjsDocument, initBlockMap } from "../document";
import type { YjsCRDTDocument } from "../document";
import { createObserver, originToOpOrigin } from "../events";
import { createYjsUndoManager } from "../undo";

const adapter = yjsAdapter();

function createPeerDoc(clientId?: number): YjsCRDTDocument {
	const doc = createYjsDocument(adapter);
	// Yjs breaks ties between concurrent inserts at the same position by client
	// id, which is random per document. Peers that race on one offset need
	// pinned ids or the merged order is a coin flip.
	if (clientId !== undefined) doc.ydoc.clientID = clientId;
	return doc;
}

function seedParagraph(doc: YjsCRDTDocument, blockId = "block-1"): Y.Text {
	doc.ydoc.transact(() => {
		initBlockMap(doc.penDocument.blocks, blockId, "paragraph", "inline");
		doc.penDocument.blockOrder.push([blockId]);
	});
	return doc.penDocument.blocks.get(blockId)!.get("content") as Y.Text;
}

function originType(origin: CRDTEvent["origin"]): string {
	return typeof origin === "string" ? origin : origin.type;
}

describe("COL1 remote is labeled remote", () => {
	it("COL1: peer B edit arrives on peer A as collaborator, not user", () => {
		const peerA = createPeerDoc();
		const peerB = createPeerDoc();
		seedParagraph(peerA);
		adapter.applyUpdate(peerB, adapter.encodeState(peerA));
		expect(
			(
				peerB.penDocument.blocks
					.get("block-1")!
					.get("content") as Y.Text
			).toString(),
		).toBe(
			(
				peerA.penDocument.blocks
					.get("block-1")!
					.get("content") as Y.Text
			).toString(),
		);

		const events: CRDTEvent[] = [];
		createObserver(peerA, (event) => events.push(event));

		const remoteText = peerB.penDocument.blocks
			.get("block-1")!
			.get("content") as Y.Text;
		peerB.ydoc.transact(() => {
			remoteText.insert(0, "from B");
		}, "user");

		adapter.applyUpdate(
			peerA,
			Y.encodeStateAsUpdate(peerB.ydoc, Y.encodeStateVector(peerA.ydoc)),
		);

		const localText = peerA.penDocument.blocks
			.get("block-1")!
			.get("content") as Y.Text;
		expect(localText.toString()).toBe("from B");
		expect(remoteText.toString()).toBe("from B");
		expect(events).toHaveLength(1);
		expect(events[0].origin).toEqual({ type: "collaborator" });
		expect(originType(events[0].origin)).toBe("collaborator");
		expect(originType(events[0].origin)).not.toBe("user");
	});

	it("COL1: absent origin is never mapped to user", () => {
		expect(originToOpOrigin(null, false)).toEqual({ type: "collaborator" });
		expect(originToOpOrigin(undefined, false)).toEqual({
			type: "collaborator",
		});
		expect(originToOpOrigin(null, true)).toEqual({
			type: "system",
			source: "absent",
		});
		expect(originToOpOrigin(undefined, true)).toEqual({
			type: "system",
			source: "absent",
		});

		const eventsSource = readFileSync(
			new URL("../events.ts", import.meta.url),
			"utf8",
		);
		expect(eventsSource).not.toMatch(
			/origin === null \|\| origin === undefined[\s\S]{0,120}type:\s*"user"/,
		);
		expect(eventsSource).not.toMatch(/return\s+"user"/);
		expect(eventsSource).not.toMatch(/origin:\s*"user"/);

		const doc = createPeerDoc();
		const ytext = seedParagraph(doc);
		const events: CRDTEvent[] = [];
		createObserver(doc, (event) => events.push(event));
		doc.ydoc.transact(() => {
			ytext.insert(0, "unlabeled");
		});

		expect(events).toHaveLength(1);
		expect(events[0].origin).toEqual({ type: "system", source: "absent" });
		expect(originType(events[0].origin)).not.toBe("user");
	});

	it("COL1: remote applyUpdate does not enter the local undo stack", () => {
		const peerA = createPeerDoc(1);
		const peerB = createPeerDoc(2);
		const localText = seedParagraph(peerA);
		adapter.applyUpdate(peerB, adapter.encodeState(peerA));
		expect(
			(
				peerB.penDocument.blocks
					.get("block-1")!
					.get("content") as Y.Text
			).toString(),
		).toBe(localText.toString());

		const undo = createYjsUndoManager(peerA);
		peerA.ydoc.transact(() => {
			localText.insert(0, "mine");
		}, "user");
		expect(undo.canUndo()).toBe(true);

		const remoteText = peerB.penDocument.blocks
			.get("block-1")!
			.get("content") as Y.Text;
		peerB.ydoc.transact(() => {
			remoteText.insert(0, "from B");
		}, "user");
		adapter.applyUpdate(
			peerA,
			Y.encodeStateAsUpdate(peerB.ydoc, Y.encodeStateVector(peerA.ydoc)),
		);

		expect(localText.toString()).toBe("minefrom B");
		expect(undo.canUndo()).toBe(true);
		undo.undo();
		expect(localText.toString()).toBe("from B");
		expect(undo.canUndo()).toBe(false);
	});
});
