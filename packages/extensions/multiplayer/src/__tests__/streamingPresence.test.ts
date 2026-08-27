import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { createTestDocument } from "@input/pen-test";
import type { Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { MultiplayerControllerImpl } from "../controller";
import { buildRemoteStreamingDecorations } from "../decorations/remoteStreaming";
import { multiplayerExtension } from "../index";
import { AuthorLedger } from "../presence/authorLedger";
import { ClientIdentityMap } from "../presence/identityMap";
import type { MultiplayerAwarenessState } from "../types";

const BLOCK_ID = "b1";
const PEER_ID = 77;
const PEER_USER = { id: "u2", name: "Babbage", color: "#abc123" };
const RESOLVED_PEER_USER = { ...PEER_USER, unverified: true as const };

function createParagraphEditor(options?: { collaborative?: boolean }): Editor {
	const { crdtDoc } = createTestDocument([
		{ id: BLOCK_ID, type: "paragraph", content: "Hello world" },
	]);
	return createEditor({
		schema: defaultSchema,
		document: crdtDoc,
		extensions: options?.collaborative
			? [multiplayerExtension({ user: { id: "u1", name: "Ada" } })]
			: [],
	});
}

function createController(editor: Editor) {
	return new MultiplayerControllerImpl({
		editor,
		config: { user: { id: "u1", name: "Ada" } },
		authorLedger: new AuthorLedger(),
		identityMap: new ClientIdentityMap(),
	});
}

function sendStreaming(
	controller: MultiplayerControllerImpl,
	blockId: string | null,
) {
	controller.handleAwarenessChange(
		new Map<number, MultiplayerAwarenessState>([
			[
				PEER_ID,
				{
					user: PEER_USER,
					streaming: blockId ? { blockId } : null,
				},
			],
		]),
	);
}

describe("local streaming presence", () => {
	it("COL2: a selection change does not unpublish another extension's key", () => {
		const editor = createParagraphEditor({ collaborative: true });
		const awareness = editor.internals.awareness!;
		awareness.setLocalState({
			...(awareness.getLocalState() ?? {}),
			streaming: { blockId: BLOCK_ID },
		});

		editor.selectText(BLOCK_ID, 2, 2);

		// a wholesale local write is what silently unpublished an AI run's
		// presence on every keystroke; presence writes merge.
		const local = awareness.getLocalState() as MultiplayerAwarenessState;
		expect(local.streaming).toEqual({ blockId: BLOCK_ID });
		expect(local.cursor).not.toBeNull();
	});
});

describe("remote streaming presence", () => {
	it("resolves a streaming payload into a peer writing into a block", () => {
		const editor = createParagraphEditor();
		const controller = createController(editor);

		sendStreaming(controller, BLOCK_ID);

		expect(controller.getRemoteStreaming()).toEqual([
			{
				clientId: PEER_ID,
				user: RESOLVED_PEER_USER,
				blockId: BLOCK_ID,
			},
		]);
	});

	it("reports the peer on its PeerState and in the snapshot", () => {
		const editor = createParagraphEditor();
		const controller = createController(editor);

		sendStreaming(controller, BLOCK_ID);

		const expected = {
			clientId: PEER_ID,
			user: RESOLVED_PEER_USER,
			blockId: BLOCK_ID,
		};
		const peer = controller
			.getPeers()
			.find((candidate) => candidate.clientId === PEER_ID);
		expect(peer?.streaming).toEqual(expected);
		expect(controller.snapshot().remoteStreaming).toEqual([expected]);
	});

	it("drops the peer when the block it was writing into is deleted", () => {
		const editor = createParagraphEditor();
		const controller = createController(editor);
		sendStreaming(controller, BLOCK_ID);
		expect(controller.getRemoteStreaming()).toHaveLength(1);

		editor.apply([{ type: "delete-block", blockId: BLOCK_ID }], {
			origin: "user",
		});

		expect(controller.getRemoteStreaming()).toEqual([]);
	});

	it("drops the peer when its run ends", () => {
		const editor = createParagraphEditor();
		const controller = createController(editor);
		sendStreaming(controller, BLOCK_ID);

		sendStreaming(controller, null);

		expect(controller.getRemoteStreaming()).toEqual([]);
	});

	it("marks the block so a renderer can show the peer is generating", () => {
		const decorations = buildRemoteStreamingDecorations([
			{
				clientId: PEER_ID,
				user: RESOLVED_PEER_USER,
				blockId: BLOCK_ID,
			},
		]);

		expect(decorations).toHaveLength(1);
		expect(decorations[0]).toMatchObject({
			type: "block",
			blockId: BLOCK_ID,
		});
		// RS1: presence says a peer is generating here and carries no
		// generated text, which stays on the client that asked for it.
		expect(JSON.stringify(decorations[0])).not.toContain("Hello");
	});
});
