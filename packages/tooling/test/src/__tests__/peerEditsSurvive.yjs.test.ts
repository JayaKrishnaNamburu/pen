import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { assertPeerEditsSurvive } from "../assertPeerEditsSurvive";
import { populateYDoc } from "../createTestDocument";
import type { TestEditor } from "../types";

const BLOCK_ID = "p1";
const TOKENS = [" A", " B"] as const;

function textOf(ydoc: Y.Doc): string {
	const blocks = ydoc.getMap("blocks");
	const blockMap = blocks.get(BLOCK_ID) as Y.Map<unknown>;
	return (blockMap.get("content") as Y.Text).toString();
}

function editorFromText(text: string): TestEditor {
	return {
		getBlock() {
			return { textContent: () => text };
		},
	} as unknown as TestEditor;
}

function createIndependentDoc(clientId: number): Y.Doc {
	const ydoc = new Y.Doc({ gc: false });
	(ydoc as unknown as { clientID: number }).clientID = clientId;
	populateYDoc(ydoc, [{ id: BLOCK_ID, type: "paragraph", content: "Hello" }]);
	return ydoc;
}

function insertAtFive(ydoc: Y.Doc, token: string): void {
	ydoc.transact(() => {
		const blocks = ydoc.getMap("blocks");
		const blockMap = blocks.get(BLOCK_ID) as Y.Map<unknown>;
		(blockMap.get("content") as Y.Text).insert(5, token);
	});
}

function exchangeFullState(docA: Y.Doc, docB: Y.Doc): void {
	Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
	Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
}

describe("assertPeerEditsSurvive (Yjs fixture)", () => {
	it("fails when a named token is missing", () => {
		expect(() =>
			assertPeerEditsSurvive(
				[editorFromText("Hello A"), editorFromText("Hello A")],
				{ blockId: BLOCK_ID, tokens: TOKENS },
			),
		).toThrow(
			'Peer 0 is missing edit " B" in block p1. texts=["Hello A","Hello A"]',
		);
	});

	it("fails when both arguments are the same editor", () => {
		const editor = editorFromText("Hello A B");
		expect(() =>
			assertPeerEditsSurvive([editor, editor], {
				blockId: BLOCK_ID,
				tokens: TOKENS,
			}),
		).toThrow("assertPeerEditsSurvive requires distinct editors");
	});

	it("fails when independently populated docs exchange full state", () => {
		const docA = createIndependentDoc(1);
		const docB = createIndependentDoc(2);
		insertAtFive(docA, " A");
		insertAtFive(docB, " B");
		exchangeFullState(docA, docB);

		const mergedA = textOf(docA);
		const mergedB = textOf(docB);
		expect(mergedA).toBe(mergedB);
		expect(["Hello A", "Hello B"]).toContain(mergedA);
		expect(["Hello A B", "Hello B A"]).not.toContain(mergedA);

		expect(() =>
			assertPeerEditsSurvive(
				[editorFromText(mergedA), editorFromText(mergedB)],
				{ blockId: BLOCK_ID, tokens: TOKENS },
			),
		).toThrow(/Peer \d is missing edit " [AB]" in block p1/);

		docA.destroy();
		docB.destroy();
	});

	it("passes when both peers fork one seed and keep both inserts", () => {
		const seed = createIndependentDoc(0);
		const seedUpdate = Y.encodeStateAsUpdate(seed);
		const docA = new Y.Doc({ gc: false });
		const docB = new Y.Doc({ gc: false });
		(docA as unknown as { clientID: number }).clientID = 1;
		(docB as unknown as { clientID: number }).clientID = 2;
		Y.applyUpdate(docA, seedUpdate);
		Y.applyUpdate(docB, seedUpdate);

		insertAtFive(docA, " A");
		expect(textOf(docB)).not.toContain(" A");
		insertAtFive(docB, " B");
		expect(textOf(docA)).not.toContain(" B");

		const fromA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
		const fromB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
		expect(fromA.byteLength).toBeGreaterThan(0);
		expect(fromB.byteLength).toBeGreaterThan(0);
		Y.applyUpdate(docB, fromA);
		Y.applyUpdate(docA, fromB);

		const mergedA = textOf(docA);
		const mergedB = textOf(docB);
		expect(mergedA).toBe(mergedB);
		expect(["Hello A B", "Hello B A"]).toContain(mergedA);
		assertPeerEditsSurvive(
			[editorFromText(mergedA), editorFromText(mergedB)],
			{ blockId: BLOCK_ID, tokens: TOKENS },
		);

		seed.destroy();
		docA.destroy();
		docB.destroy();
	});
});
