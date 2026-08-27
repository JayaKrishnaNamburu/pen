import type { CRDTEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import { initBlockMap } from "../document";
import type { YjsCRDTDocument } from "../document";
import { canonicalOrigin, createObserver } from "../events";
import { createYjsUndoManager } from "../undo";

/**
 * Origin-shape contract on the adapter side of core → yjs → undo.
 *
 * Core's apply pipeline calls `adapter.transact` with
 * `toStructuredOrigin(origin)` — a freshly allocated `{ type, groupId?,
 * requestId? }`, not the interned `canonicalOrigin` token and not the
 * string `"user"`. Y.UndoManager captures with `trackedOrigins.has`, which
 * is identity-based. TrackedOriginSet therefore matches on the `.type`
 * discriminant. If that match is removed, a user apply is silently not
 * captured and undo becomes a no-op on a changed document.
 *
 * These tests go through `adapter.transact`, `ydoc.transact`, and
 * `adapter.applyUpdate` and assert on the document, so they fail the moment
 * a fresh structured user origin stops being tracked. Extra fields, frozen
 * objects, and null-prototype origins must still match on `.type`. A
 * non-string `type` and a remote applyUpdate must stay uncaptured. Two-peer
 * rows first prove the receiver observed the sender's insert.
 */

function seedParagraph(adapter: ReturnType<typeof yjsAdapter>): {
	doc: YjsCRDTDocument;
	ytext: Y.Text;
} {
	const doc = adapter.createDocument() as YjsCRDTDocument;
	adapter.transact(doc, () => {
		initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
		doc.penDocument.blockOrder.push(["b1"]);
	});
	return {
		doc,
		ytext: doc.penDocument.blocks.get("b1")!.get("content") as Y.Text,
	};
}

describe("@input/pen-yjs origin shape contract", () => {
	it("captures a fresh structured user origin so undo restores the document", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const freshUserOrigin = { type: "user" as const };
		expect(freshUserOrigin).not.toBe(canonicalOrigin("user"));

		adapter.transact(
			doc,
			() => {
				ytext.insert(0, "typed");
			},
			freshUserOrigin,
		);
		expect(ytext.toString()).toBe("typed");

		expect(undo.undo()).toBe(true);
		expect(ytext.toString()).toBe("");
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("");
	});

	it("captures a structured user origin that carries groupId and requestId", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const freshUserOrigin = {
			type: "user" as const,
			groupId: "turn-1",
			requestId: "req-1",
		};
		const events: CRDTEvent[] = [];
		createObserver(doc, (event) => events.push(event));

		adapter.transact(
			doc,
			() => {
				ytext.insert(0, "one");
			},
			freshUserOrigin,
		);
		expect(ytext.toString()).toBe("one");
		expect(events[0]?.origin).toEqual(freshUserOrigin);
		expect(events[0]?.origin).toBe(freshUserOrigin);

		expect(undo.undo()).toBe(true);
		expect(ytext.toString()).toBe("");
		expect(undo.undo()).toBe(false);
	});

	it("does not capture a structured collaborator origin: undo leaves the document", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const freshCollaborator = { type: "collaborator" as const };
		expect(freshCollaborator).not.toBe(canonicalOrigin("collaborator"));

		adapter.transact(
			doc,
			() => {
				ytext.insert(0, "remote");
			},
			freshCollaborator,
		);
		expect(ytext.toString()).toBe("remote");
		expect(undo.canUndo()).toBe(false);
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("remote");
	});

	it("DUR4: does not capture a structured migration origin: undo leaves the document", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const freshMigration = { type: "migration" as const };
		expect(freshMigration).not.toBe(canonicalOrigin("migration"));

		adapter.transact(
			doc,
			() => {
				ytext.insert(0, "upgraded");
			},
			freshMigration,
		);
		expect(ytext.toString()).toBe("upgraded");
		expect(undo.canUndo()).toBe(false);
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("upgraded");
	});

	it("captures a structured user origin that carries an unexpected extra field", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const origin = {
			type: "user" as const,
			unexpected: "field",
			nested: { type: "collaborator" as const },
		};

		adapter.transact(
			doc,
			() => {
				ytext.insert(0, "typed");
			},
			origin,
		);
		expect(ytext.toString()).toBe("typed");

		expect(undo.undo()).toBe(true);
		expect(ytext.toString()).toBe("");
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("");
	});

	it("captures a frozen structured user origin so undo restores the document", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const frozen = Object.freeze({
			type: "user" as const,
			groupId: "frozen-1",
			requestId: "req-frozen",
		});

		adapter.transact(
			doc,
			() => {
				ytext.insert(0, "typed");
			},
			frozen,
		);
		expect(ytext.toString()).toBe("typed");

		expect(undo.undo()).toBe(true);
		expect(ytext.toString()).toBe("");
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("");
	});

	it("does not capture a structured origin whose type is not a string", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);

		doc.ydoc.transact(
			() => {
				ytext.insert(0, "typed");
			},
			{ type: 1 },
		);
		expect(ytext.toString()).toBe("typed");

		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("typed");
	});

	it("captures a null-prototype structured user origin arriving via ydoc.transact", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);
		const origin = Object.assign(Object.create(null) as { type: string }, {
			type: "user",
		});

		doc.ydoc.transact(() => {
			ytext.insert(0, "typed");
		}, origin);
		expect(ytext.toString()).toBe("typed");

		expect(undo.undo()).toBe(true);
		expect(ytext.toString()).toBe("");
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("");
	});

	it("does not capture an applyUpdate write even when the sender tagged user", () => {
		const adapter = yjsAdapter();
		const { doc, ytext } = seedParagraph(adapter);
		const undo = createYjsUndoManager(doc);

		const remote = adapter.loadDocument(
			adapter.encodeState(doc),
		) as YjsCRDTDocument;
		remote.ydoc.clientID = 2;
		const remoteText = remote.penDocument.blocks
			.get("b1")!
			.get("content") as Y.Text;
		expect(remoteText.toString()).toBe(ytext.toString());

		const since = Y.encodeStateVector(doc.ydoc);
		remote.ydoc.transact(
			() => {
				remoteText.insert(0, "remote");
			},
			{ type: "user" },
		);
		expect(remoteText.toString()).toBe("remote");

		adapter.applyUpdate(doc, adapter.encodeUpdate(remote, since));
		expect(ytext.toString()).toBe("remote");

		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("remote");
	});

	it("COL1: peer B observes peer A's user insert, then A's undo does not revert B's later insert", () => {
		const adapter = yjsAdapter();
		const peerA = adapter.createDocument() as YjsCRDTDocument;
		peerA.ydoc.clientID = 1;
		adapter.transact(peerA, () => {
			initBlockMap(peerA.penDocument.blocks, "b1", "paragraph", "inline");
			peerA.penDocument.blockOrder.push(["b1"]);
		});
		const textA = peerA.penDocument.blocks
			.get("b1")!
			.get("content") as Y.Text;
		const undoA = createYjsUndoManager(peerA);

		adapter.transact(
			peerA,
			() => {
				textA.insert(0, "from-a");
			},
			{ type: "user" },
		);
		expect(textA.toString()).toBe("from-a");

		const peerB = adapter.loadDocument(
			adapter.encodeState(peerA),
		) as YjsCRDTDocument;
		peerB.ydoc.clientID = 2;
		const textB = peerB.penDocument.blocks
			.get("b1")!
			.get("content") as Y.Text;
		expect(textB.toString()).toBe("from-a");

		const since = Y.encodeStateVector(peerA.ydoc);
		adapter.transact(
			peerB,
			() => {
				textB.insert(textB.length, "+b");
			},
			{ type: "user" },
		);
		expect(textB.toString()).toBe("from-a+b");

		adapter.applyUpdate(peerA, adapter.encodeUpdate(peerB, since));
		expect(textA.toString()).toBe("from-a+b");

		expect(undoA.undo()).toBe(true);
		expect(textA.toString()).toBe("+b");
		expect(undoA.undo()).toBe(false);
		expect(textA.toString()).toBe("+b");
	});
});
