import { createEditor } from "@input/pen-core";
import { createTestDocument } from "@input/pen-test";
import type { DiagnosticEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { MultiplayerControllerImpl } from "../controller";
import {
	MAX_PRESENCE_BYTES_PER_PEER,
	MAX_PRESENCE_DISPLAY_NAME_LENGTH,
	MAX_PRESENCE_UPDATES_PER_SECOND,
	MAX_TRACKED_PEERS,
	PRESENCE_REJECTED_CODE,
} from "../presence/constants";
import { AuthorLedger } from "../presence/authorLedger";
import { ClientIdentityMap } from "../presence/identityMap";
import { getMultiplayerController, multiplayerExtension } from "../index";
import type { MultiplayerAwarenessState } from "../types";

const GOOD_PEER_ID = 77;
const BAD_PEER_ID = 88;
const SCRIPT_NAME = '"><script>window.__xssProbe=1</script>';

function createPresenceEditor(now?: () => number) {
	const { crdtDoc } = createTestDocument([
		{ id: "b1", type: "paragraph", content: "Hello" },
		{ id: "b2", type: "paragraph", content: "world" },
	]);
	const editor = createEditor({
		document: crdtDoc,
		extensions: [
			multiplayerExtension({
				user: { id: "u1", name: "Ada" },
			}),
		],
	});
	const controller = getMultiplayerController(editor) as MultiplayerControllerImpl;
	if (now) {
		return {
			editor,
			controller: new MultiplayerControllerImpl({
				editor,
				config: { user: { id: "u1", name: "Ada" } },
				authorLedger: new AuthorLedger(),
				identityMap: new ClientIdentityMap(),
				now,
			}),
			diagnostics: listenDiagnostics(editor),
		};
	}
	return {
		editor,
		controller,
		diagnostics: listenDiagnostics(editor),
	};
}

function listenDiagnostics(editor: ReturnType<typeof createEditor>): DiagnosticEvent[] {
	const diagnostics: DiagnosticEvent[] = [];
	editor.on("diagnostic", (event) => {
		diagnostics.push(event);
	});
	return diagnostics;
}

function localState(
	editor: ReturnType<typeof createEditor>,
): [number, MultiplayerAwarenessState] {
	return [editor.clientId, { user: { id: "u1", name: "Ada" } }];
}

function goodPeerState(): MultiplayerAwarenessState {
	return {
		user: { id: "u-good", name: "Grace", color: "#abc123" },
		cursor: { blockId: "b1", offset: 2, clock: 10 },
	};
}

function applyStates(
	controller: MultiplayerControllerImpl,
	editor: ReturnType<typeof createEditor>,
	entries: Array<[number, MultiplayerAwarenessState]>,
): void {
	controller.handleAwarenessChange(
		new Map<number, MultiplayerAwarenessState>([
			localState(editor),
			...entries,
		]),
	);
	editor.requestDecorationUpdate();
}

function goodPeerDecoration(editor: ReturnType<typeof createEditor>) {
	return editor.getDecorations().inlineForBlock("b1").find((decoration) => {
		return decoration.attributes?.["data-user-id"] === "u-good";
	});
}

function rejectedReasons(diagnostics: DiagnosticEvent[]): string[] {
	return diagnostics
		.filter((event) => event.code === PRESENCE_REJECTED_CODE)
		.map((event) => String(event.reason));
}

describe("COL2 awareness is untrusted input", () => {
	it("COL2 oversized presence is dropped with a diagnostic and does not break good peers", () => {
		const { editor, controller, diagnostics } = createPresenceEditor();

		applyStates(controller, editor, [
			[GOOD_PEER_ID, goodPeerState()],
			[
				BAD_PEER_ID,
				{
					user: {
						id: "u-bad",
						name: "x".repeat(MAX_PRESENCE_DISPLAY_NAME_LENGTH + 1),
					},
					cursor: { blockId: "b1", offset: 1, clock: 11 },
				},
			],
			[
				99,
				{
					user: { id: "u-huge", name: "Pad" },
					padding: "x".repeat(MAX_PRESENCE_BYTES_PER_PEER),
					cursor: { blockId: "b1", offset: 1, clock: 12 },
				} as MultiplayerAwarenessState,
			],
		]);

		const decoration = goodPeerDecoration(editor);
		expect(decoration).toBeDefined();
		expect(decoration?.attributes?.["data-user-name"]).toBe("Grace");
		expect(
			editor.getDecorations().inlineForBlock("b1").some((item) => {
				return item.attributes?.["data-user-id"] === "u-bad";
			}),
		).toBe(false);
		expect(controller.getRemoteCursors().map((cursor) => cursor.clientId)).toEqual(
			[GOOD_PEER_ID],
		);
		expect(rejectedReasons(diagnostics)).toEqual(["oversized", "oversized"]);
		expect((globalThis as { __xssProbe?: unknown }).__xssProbe).toBeUndefined();

		editor.destroy();
	});

	it("COL2 wrong-typed presence is dropped with a diagnostic and does not break good peers", () => {
		const { editor, controller, diagnostics } = createPresenceEditor();

		applyStates(controller, editor, [
			[GOOD_PEER_ID, goodPeerState()],
			[
				BAD_PEER_ID,
				{
					user: { id: 2, name: "Invalid" },
					cursor: { blockId: "b1", offset: 1, clock: 11 },
				} as unknown as MultiplayerAwarenessState,
			],
		]);

		expect(goodPeerDecoration(editor)?.attributes?.["data-user-id"]).toBe(
			"u-good",
		);
		expect(controller.getRemoteCursors().map((cursor) => cursor.clientId)).toEqual(
			[GOOD_PEER_ID],
		);
		expect(rejectedReasons(diagnostics)).toEqual(["wrong-typed"]);
		expect((globalThis as { __xssProbe?: unknown }).__xssProbe).toBeUndefined();

		editor.destroy();
	});

	it("COL2 script-bearing presence is dropped with a diagnostic and does not break good peers", () => {
		const { editor, controller, diagnostics } = createPresenceEditor();

		applyStates(controller, editor, [
			[GOOD_PEER_ID, goodPeerState()],
			[
				BAD_PEER_ID,
				{
					user: { id: "u-xss", name: SCRIPT_NAME },
					cursor: { blockId: "b1", offset: 1, clock: 11 },
				},
			],
		]);

		const decorations = editor.getDecorations().inlineForBlock("b1");
		expect(goodPeerDecoration(editor)?.attributes?.["data-user-name"]).toBe(
			"Grace",
		);
		expect(
			JSON.stringify(decorations).includes("<script") ||
				JSON.stringify(decorations).includes(SCRIPT_NAME),
		).toBe(false);
		expect(
			decorations.some((decoration) =>
				Object.keys(decoration.attributes ?? {}).some((key) =>
					key.toLowerCase().startsWith("on"),
				),
			),
		).toBe(false);
		expect(controller.getRemoteCursors().map((cursor) => cursor.clientId)).toEqual(
			[GOOD_PEER_ID],
		);
		expect(rejectedReasons(diagnostics)).toEqual(["script-bearing"]);
		expect((globalThis as { __xssProbe?: unknown }).__xssProbe).toBeUndefined();

		editor.destroy();
	});

	it("COL2 nonexistent-block presence is dropped with a diagnostic and does not break good peers", () => {
		const { editor, controller, diagnostics } = createPresenceEditor();

		applyStates(controller, editor, [
			[GOOD_PEER_ID, goodPeerState()],
			[
				BAD_PEER_ID,
				{
					user: { id: "u-ghost", name: "Ghost", color: "#abc123" },
					cursor: { blockId: "missing-block", offset: 0, clock: 11 },
					selection: {
						anchor: { blockId: "missing-block", offset: 0 },
						head: { blockId: "b1", offset: 2 },
						clock: 12,
					},
				},
			],
		]);

		expect(goodPeerDecoration(editor)?.attributes?.["data-user-id"]).toBe(
			"u-good",
		);
		expect(controller.getRemoteCursors().map((cursor) => cursor.clientId)).toEqual(
			[GOOD_PEER_ID],
		);
		expect(controller.getRemoteSelections()).toEqual([]);
		expect(controller.getPeers().some((peer) => peer.clientId === BAD_PEER_ID)).toBe(
			true,
		);
		expect(rejectedReasons(diagnostics)).toEqual(["nonexistent-block"]);
		expect((globalThis as { __xssProbe?: unknown }).__xssProbe).toBeUndefined();

		editor.destroy();
	});

	it("COL2 peer cap counts extra peers and keeps already-tracked presence rendering", () => {
		const { editor, controller, diagnostics } = createPresenceEditor();
		const entries: Array<[number, MultiplayerAwarenessState]> = [];
		for (let index = 0; index < MAX_TRACKED_PEERS + 3; index += 1) {
			entries.push([
				100 + index,
				{
					user: { id: `u-${index}`, name: `Peer ${index}`, color: "#abc123" },
					cursor: { blockId: "b1", offset: 1, clock: index },
				},
			]);
		}

		applyStates(controller, editor, entries);

		expect(controller.getRemoteCursors()).toHaveLength(MAX_TRACKED_PEERS);
		expect(controller.getPeers()).toHaveLength(MAX_TRACKED_PEERS);
		expect(rejectedReasons(diagnostics)).toEqual(["peer-cap"]);
		expect(
			diagnostics.find((event) => event.reason === "peer-cap")
				?.untrackedPeerCount,
		).toBe(3);

		editor.destroy();
	});

	it("COL2 per-peer update rate limit keeps the last accepted presence", () => {
		let now = 1_000_000;
		const { editor, controller, diagnostics } = createPresenceEditor(() => now);

		for (let index = 0; index < MAX_PRESENCE_UPDATES_PER_SECOND; index += 1) {
			now += 1;
			applyStates(controller, editor, [
				[
					GOOD_PEER_ID,
					{
						user: { id: "u-good", name: "Grace", color: "#abc123" },
						cursor: { blockId: "b1", offset: index % 5, clock: index },
					},
				],
			]);
		}

		const acceptedOffset = controller.getRemoteCursors()[0]?.offset;
		now += 1;
		applyStates(controller, editor, [
			[
				GOOD_PEER_ID,
				{
					user: { id: "u-good", name: "Grace", color: "#abc123" },
					cursor: { blockId: "b1", offset: 4, clock: 99 },
				},
			],
		]);

		expect(controller.getRemoteCursors()[0]?.offset).toBe(acceptedOffset);
		expect(controller.getRemoteCursors()[0]?.clock).not.toBe(99);
		expect(rejectedReasons(diagnostics)).toContain("rate-limited");

		now += 1_000;
		applyStates(controller, editor, [
			[
				GOOD_PEER_ID,
				{
					user: { id: "u-good", name: "Grace", color: "#abc123" },
					cursor: { blockId: "b1", offset: 4, clock: 100 },
				},
			],
		]);
		expect(controller.getRemoteCursors()[0]?.offset).toBe(4);

		editor.destroy();
	});
});
