import * as Y from "yjs";
import { deepEqual } from "@input/pen-core";
import { createTestEditor } from "./createTestEditor";
import { normalizeDocumentForSnapshot } from "./fixtures";
import type {
	NormalizedYDocSnapshot,
	TestEditor,
	TestEditorOptions,
	TwoPeer,
	TwoPeerHarness,
	TwoPeerHarnessOptions,
	TwoPeerId,
	TwoPeerInterleaving,
} from "./types";

export const TWO_PEER_INTERLEAVINGS = [
	"a-then-b",
	"b-then-a",
] as const satisfies readonly TwoPeerInterleaving[];

const DEFAULT_CLIENT_ID_A = 1;
const DEFAULT_CLIENT_ID_B = 2;

export function createTwoPeerHarness(
	options: TwoPeerHarnessOptions = {},
): TwoPeerHarness {
	const {
		clientIdA = DEFAULT_CLIENT_ID_A,
		clientIdB = DEFAULT_CLIENT_ID_B,
		prepare,
		...seedOptions
	} = options;

	const seed = createTestEditor(seedOptions);
	let peerA: TwoPeer;
	let peerB: TwoPeer;
	try {
		prepare?.(seed);
		const seedUpdate = seed.crdtDoc.adapter.encodeState(seed.crdtDoc);
		peerA = forkPeer("a", clientIdA, seedUpdate, seedOptions);
		peerB = forkPeer("b", clientIdB, seedUpdate, seedOptions);
	} finally {
		seed.destroy();
	}

	const peers: Record<TwoPeerId, TwoPeer> = { a: peerA, b: peerB };

	const peer = (id: TwoPeerId): TwoPeer => {
		switch (id) {
			case "a":
			case "b":
				return peers[id];
			default: {
				const _never: never = id;
				throw new Error(`Unknown two-peer id: ${String(_never)}`);
			}
		}
	};

	const encodeUpdateFrom = (from: TwoPeerId): Uint8Array => {
		const source = peer(from);
		const target = peer(otherPeer(from));
		const since = Y.encodeStateVector(target.editor.ydoc);
		return source.adapter.encodeUpdate(source.crdtDoc, since);
	};

	const applyUpdateTo = (to: TwoPeerId, update: Uint8Array): void => {
		const target = peer(to);
		target.adapter.applyUpdate(target.crdtDoc, update);
	};

	const captureUpdates = (): { fromA: Uint8Array; fromB: Uint8Array } => ({
		fromA: encodeUpdateFrom("a"),
		fromB: encodeUpdateFrom("b"),
	});

	const exchange = (interleaving: TwoPeerInterleaving = "a-then-b"): void => {
		const { fromA, fromB } = captureUpdates();
		switch (interleaving) {
			case "a-then-b":
				applyUpdateTo("b", fromA);
				applyUpdateTo("a", fromB);
				break;
			case "b-then-a":
				applyUpdateTo("a", fromB);
				applyUpdateTo("b", fromA);
				break;
			default: {
				const _never: never = interleaving;
				throw new Error(`Unknown interleaving: ${String(_never)}`);
			}
		}
	};

	const snapshot = (id: TwoPeerId = "a"): NormalizedYDocSnapshot =>
		normalizeDocumentForSnapshot(peer(id).editor.ydoc);

	return {
		peerA,
		peerB,
		peer,
		encodeUpdateFrom,
		applyUpdateTo,
		captureUpdates,
		exchange,
		sync: exchange,
		normalizeAll() {
			peerA.editor.normalizeAll();
			peerB.editor.normalizeAll();
		},
		assertConverged(message) {
			const snapA = snapshot("a");
			const snapB = snapshot("b");
			if (deepEqual(snapA, snapB)) {
				return;
			}
			const detail = message ? `${message}\n` : "";
			throw new Error(
				`${detail}Two-peer documents did not converge.\nA: ${JSON.stringify(snapA)}\nB: ${JSON.stringify(snapB)}`,
			);
		},
		snapshot,
		destroy() {
			peerA.editor.destroy();
			peerB.editor.destroy();
		},
	};
}

export function runBothInterleavings(
	options: TwoPeerHarnessOptions,
	apply: (harness: TwoPeerHarness, interleaving: TwoPeerInterleaving) => void,
	invariant?: (
		harness: TwoPeerHarness,
		interleaving: TwoPeerInterleaving,
	) => void,
): void {
	for (const interleaving of TWO_PEER_INTERLEAVINGS) {
		const harness = createTwoPeerHarness(options);
		try {
			apply(harness, interleaving);
			if (invariant) {
				harness.exchange(interleaving);
				harness.normalizeAll();
				harness.assertConverged();
				invariant(harness, interleaving);
			}
		} finally {
			harness.destroy();
		}
	}
}

function otherPeer(id: TwoPeerId): TwoPeerId {
	switch (id) {
		case "a":
			return "b";
		case "b":
			return "a";
		default: {
			const _never: never = id;
			throw new Error(`Unknown two-peer id: ${String(_never)}`);
		}
	}
}

function forkPeer(
	id: TwoPeerId,
	clientId: number,
	seedUpdate: Uint8Array,
	editorOptions: TestEditorOptions,
): TwoPeer {
	const ydoc = new Y.Doc({ gc: false });
	(ydoc as unknown as { clientID: number }).clientID = clientId;
	Y.applyUpdate(ydoc, seedUpdate);

	const { blocks: _blocks, doc: _doc, ...rest } = editorOptions;
	const editor: TestEditor = createTestEditor({ ...rest, doc: ydoc });

	return {
		id,
		editor,
		adapter: editor.crdtDoc.adapter,
		crdtDoc: editor.crdtDoc,
	};
}
