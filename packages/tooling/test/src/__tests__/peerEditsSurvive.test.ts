import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
	assertDocEquals,
	assertPeerEditsSurvive,
	createTestCollaboration,
	createTestEditor,
	populateYDoc,
	resetTestIdCounter,
} from "../index";

const BLOCK_ID = "p1";
const TOKENS = [" A", " B"] as const;

beforeEach(() => {
	resetTestIdCounter();
});

function insertToken(
	editor: ReturnType<typeof createTestEditor>,
	token: string,
) {
	const ydoc = editor.ydoc as Y.Doc;
	ydoc.transact(() => {
		const blocks = ydoc.getMap("blocks");
		const blockMap = blocks.get(BLOCK_ID) as Y.Map<unknown>;
		const content = blockMap.get("content") as Y.Text;
		content.insert(5, token);
	});
}

function createIndependentEditor(clientId: number) {
	const ydoc = new Y.Doc({ gc: false });
	(ydoc as unknown as { clientID: number }).clientID = clientId;
	populateYDoc(ydoc, [{ id: BLOCK_ID, type: "paragraph", content: "Hello" }]);
	return createTestEditor({ doc: ydoc });
}

function createIndependentPeers() {
	return {
		editorA: createIndependentEditor(1),
		editorB: createIndependentEditor(2),
	};
}

function exchangeFullState(
	editorA: ReturnType<typeof createTestEditor>,
	editorB: ReturnType<typeof createTestEditor>,
) {
	Y.applyUpdate(editorB.ydoc, Y.encodeStateAsUpdate(editorA.ydoc));
	Y.applyUpdate(editorA.ydoc, Y.encodeStateAsUpdate(editorB.ydoc));
}

describe("assertPeerEditsSurvive", () => {
	it("fails on two unsynced independently seeded documents", () => {
		const { editorA, editorB } = createIndependentPeers();
		insertToken(editorA, " A");
		insertToken(editorB, " B");

		expect(() =>
			assertPeerEditsSurvive([editorA, editorB], {
				blockId: BLOCK_ID,
				tokens: TOKENS,
			}),
		).toThrow(/Peer 0 is missing edit " B"/);

		void editorA.destroy();
		void editorB.destroy();
	});

	it("fails when independent populate plus full-state exchange drops one edit and assertDocEquals still passes", () => {
		const { editorA, editorB } = createIndependentPeers();
		insertToken(editorA, " A");
		insertToken(editorB, " B");
		exchangeFullState(editorA, editorB);

		expect(() => assertDocEquals(editorA, editorB)).not.toThrow();
		const merged = editorA.getBlock(BLOCK_ID).textContent();
		expect(editorB.getBlock(BLOCK_ID).textContent()).toBe(merged);
		expect(["Hello A", "Hello B"]).toContain(merged);
		expect(() =>
			assertPeerEditsSurvive([editorA, editorB], {
				blockId: BLOCK_ID,
				tokens: TOKENS,
			}),
		).toThrow(/missing edit/);

		void editorA.destroy();
		void editorB.destroy();
	});

	it("passes on createTestCollaboration after concurrent inserts", () => {
		const collab = createTestCollaboration({
			blocks: [{ id: BLOCK_ID, type: "paragraph", content: "Hello" }],
		});
		insertToken(collab.editorA, " A");
		expect(collab.editorB.getBlock(BLOCK_ID).textContent()).not.toContain(" A");
		insertToken(collab.editorB, " B");
		collab.sync();

		assertDocEquals(collab.editorA, collab.editorB);
		assertPeerEditsSurvive([collab.editorA, collab.editorB], {
			blockId: BLOCK_ID,
			tokens: TOKENS,
		});

		void collab.editorA.destroy();
		void collab.editorB.destroy();
	});
});
