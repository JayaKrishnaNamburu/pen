import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { createTestDocument } from "@input/pen-test";
import type { DiagnosticEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { MultiplayerControllerImpl } from "../controller";
import { getMultiplayerController, multiplayerExtension } from "../index";
import { validateAwarenessStates } from "../presence/awarenessValidator";
import { AuthorLedger } from "../presence/authorLedger";
import {
	MAX_PRESENCE_AVATAR_URL_LENGTH,
	MAX_PRESENCE_BLOCK_SELECTION_IDS,
	MAX_PRESENCE_BYTES_PER_PEER,
	MAX_PRESENCE_DISPLAY_NAME_LENGTH,
	MAX_PRESENCE_UPDATES_PER_SECOND,
	MAX_PRESENCE_USER_ID_LENGTH,
	MAX_TRACKED_PEERS,
	PRESENCE_REJECTED_CODE,
} from "../presence/constants";
import { ClientIdentityMap } from "../presence/identityMap";
import type { MultiplayerAwarenessState } from "../types";

const LOCAL_CLIENT_ID = 1;
const GOOD_PEER_ID = 77;
const BAD_PEER_ID = 88;
const SCRIPT_NAME = '"><script>window.__xssProbe=1</script>';

const documentView = {
	blockLength(blockId: string): number | null {
		return blockId === "b1" ? 5 : null;
	},
};

const validPeer = {
	user: { id: "u2", name: "Babbage", color: "#abc123" },
	cursor: { blockId: "b1", offset: 2, clock: 10 },
	selection: {
		kind: "text" as const,
		anchor: { blockId: "b1", offset: 1 },
		head: { blockId: "b1", offset: 3 },
		clock: 11,
	},
};

function validate(states: Array<[number, unknown]>) {
	return validateAwarenessStates(
		new Map(states),
		documentView,
		LOCAL_CLIENT_ID,
	);
}

function withOwnKey(
	base: Record<string, unknown>,
	key: string,
	value: unknown,
): Record<string, unknown> {
	Object.defineProperty(base, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
	return base;
}

function createPresenceEditor(now?: () => number) {
	const { crdtDoc } = createTestDocument([
		{ id: "b1", type: "paragraph", content: "Hello" },
		{ id: "b2", type: "paragraph", content: "world" },
	]);
	const editor = createEditor({
		schema: defaultSchema,
		document: crdtDoc,
		extensions: [
			multiplayerExtension({
				user: { id: "u1", name: "Ada" },
			}),
		],
	});
	const controller = now
		? new MultiplayerControllerImpl({
				editor,
				config: { user: { id: "u1", name: "Ada" } },
				authorLedger: new AuthorLedger(),
				identityMap: new ClientIdentityMap(),
				now,
			})
		: (getMultiplayerController(editor) as MultiplayerControllerImpl);
	return {
		editor,
		controller,
		diagnostics: listenDiagnostics(editor),
	};
}

function listenDiagnostics(
	editor: ReturnType<typeof createEditor>,
): DiagnosticEvent[] {
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
	it("COL2: oversized ignored — payload over the byte cap drops the peer", () => {
		const result = validate([
			[
				BAD_PEER_ID,
				{
					user: { id: "u-bad", name: "TooBig" },
					padding: "x".repeat(MAX_PRESENCE_BYTES_PER_PEER),
				},
			],
		]);

		expect(result.states.has(BAD_PEER_ID)).toBe(false);
		expect(result.rejections).toEqual([
			{ clientId: BAD_PEER_ID, reason: "oversized" },
		]);
	});

	it("COL2: oversized ignored — circular state that cannot be measured drops the peer", () => {
		const circular: Record<string, unknown> = {
			user: { id: "u-bad", name: "Loop" },
		};
		circular.self = circular;

		const result = validate([[BAD_PEER_ID, circular]]);

		expect(result.states.has(BAD_PEER_ID)).toBe(false);
		expect(result.rejections).toEqual([
			{ clientId: BAD_PEER_ID, reason: "oversized" },
		]);
	});

	it("COL2: oversized ignored — over-long user id, name, or avatar drop the peer", () => {
		const cases: unknown[] = [
			{
				user: {
					id: "i".repeat(MAX_PRESENCE_USER_ID_LENGTH + 1),
					name: "Ada",
				},
			},
			{
				user: {
					id: "u-bad",
					name: "n".repeat(MAX_PRESENCE_DISPLAY_NAME_LENGTH + 1),
				},
			},
			{
				user: {
					id: "u-bad",
					name: "Ada",
					avatar: `https://example.com/${"a".repeat(MAX_PRESENCE_AVATAR_URL_LENGTH)}`,
				},
			},
		];

		for (const state of cases) {
			const result = validate([[BAD_PEER_ID, state]]);
			expect(result.states.has(BAD_PEER_ID)).toBe(false);
			expect(result.rejections).toEqual([
				{ clientId: BAD_PEER_ID, reason: "oversized" },
			]);
		}
	});

	it("COL2: oversized ignored — over-long cursor and selection fields drop those fields only", () => {
		const longBlockId = "b".repeat(MAX_PRESENCE_USER_ID_LENGTH + 1);
		const tooManyBlockIds = Array.from(
			{ length: MAX_PRESENCE_BLOCK_SELECTION_IDS + 1 },
			(_, index) => `b${index}`,
		);

		const cursorResult = validate([
			[
				BAD_PEER_ID,
				{
					user: { id: "u-bad", name: "Ada" },
					cursor: { blockId: longBlockId, offset: 0 },
					selection: validPeer.selection,
				},
			],
		]);
		expect(cursorResult.states.get(BAD_PEER_ID)).toEqual({
			user: { id: "u-bad", name: "Ada" },
			cursor: null,
			selection: validPeer.selection,
		});
		expect(cursorResult.rejections).toEqual([
			{ clientId: BAD_PEER_ID, reason: "oversized" },
		]);

		const textSelectionResult = validate([
			[
				BAD_PEER_ID,
				{
					user: { id: "u-bad", name: "Ada" },
					cursor: validPeer.cursor,
					selection: {
						anchor: { blockId: longBlockId, offset: 0 },
						head: { blockId: "b1", offset: 1 },
					},
				},
			],
		]);
		expect(textSelectionResult.states.get(BAD_PEER_ID)).toEqual({
			user: { id: "u-bad", name: "Ada" },
			cursor: validPeer.cursor,
			selection: null,
		});
		expect(textSelectionResult.rejections).toEqual([
			{ clientId: BAD_PEER_ID, reason: "oversized" },
		]);

		const blockSelectionResult = validate([
			[
				BAD_PEER_ID,
				{
					user: { id: "u-bad", name: "Ada" },
					selection: { kind: "block", blockIds: tooManyBlockIds },
				},
			],
		]);
		expect(blockSelectionResult.states.get(BAD_PEER_ID)).toEqual({
			user: { id: "u-bad", name: "Ada" },
			cursor: null,
			selection: null,
		});
		expect(blockSelectionResult.rejections).toEqual([
			{ clientId: BAD_PEER_ID, reason: "oversized" },
		]);
	});

	it("COL2: wrong-typed ignored — non-record, array, and forbidden keys drop the peer", () => {
		const cases: unknown[] = [
			null,
			"presence",
			["user"],
			withOwnKey({ user: { id: "u-bad", name: "Ada" } }, "__proto__", {}),
			withOwnKey(
				{ user: { id: "u-bad", name: "Ada" } },
				"constructor",
				{},
			),
			withOwnKey({ user: { id: "u-bad", name: "Ada" } }, "prototype", {}),
		];

		for (const state of cases) {
			const result = validate([[BAD_PEER_ID, state]]);
			expect(result.states.has(BAD_PEER_ID)).toBe(false);
			expect(result.rejections).toEqual([
				{ clientId: BAD_PEER_ID, reason: "wrong-typed" },
			]);
		}
	});

	it("COL2: wrong-typed ignored — invalid user drops the peer", () => {
		const cases: unknown[] = [
			{ user: null },
			{ user: ["u-bad", "Ada"] },
			{ user: { id: 2, name: "Ada" } },
			{ user: { id: "u-bad", name: 3 } },
			{ user: { id: "u-bad", name: "Ada", color: 12 } },
			{ user: { id: "u-bad", name: "Ada", avatar: false } },
			{
				user: withOwnKey({ id: "u-bad", name: "Ada" }, "__proto__", {}),
			},
		];

		for (const state of cases) {
			const result = validate([[BAD_PEER_ID, state]]);
			expect(result.states.has(BAD_PEER_ID)).toBe(false);
			expect(result.rejections).toEqual([
				{ clientId: BAD_PEER_ID, reason: "wrong-typed" },
			]);
		}
	});

	it("COL2: wrong-typed ignored — invalid cursor and selection drop those fields only", () => {
		const cursorCases: unknown[] = [
			"caret",
			{ blockId: 1, offset: 0 },
			{ blockId: "b1", offset: Number.NaN },
			{ blockId: "b1", offset: 1, clock: "later" },
			withOwnKey({ blockId: "b1", offset: 1 }, "constructor", {}),
		];

		for (const cursor of cursorCases) {
			const result = validate([
				[BAD_PEER_ID, { user: { id: "u-bad", name: "Ada" }, cursor }],
			]);
			expect(result.states.get(BAD_PEER_ID)).toEqual({
				user: { id: "u-bad", name: "Ada" },
				cursor: null,
				selection: null,
			});
			expect(result.rejections).toEqual([
				{ clientId: BAD_PEER_ID, reason: "wrong-typed" },
			]);
		}

		const selectionCases: unknown[] = [
			"range",
			{
				kind: "range",
				anchor: validPeer.selection.anchor,
				head: validPeer.selection.head,
			},
			{ kind: "block", blockIds: "b1" },
			{ kind: "block", blockIds: [1] },
			{ ...validPeer.selection, clock: Number.POSITIVE_INFINITY },
			{ head: validPeer.selection.head },
			withOwnKey(
				{
					anchor: validPeer.selection.anchor,
					head: validPeer.selection.head,
				},
				"prototype",
				{},
			),
		];

		for (const selection of selectionCases) {
			const result = validate([
				[BAD_PEER_ID, { user: { id: "u-bad", name: "Ada" }, selection }],
			]);
			expect(result.states.get(BAD_PEER_ID)).toEqual({
				user: { id: "u-bad", name: "Ada" },
				cursor: null,
				selection: null,
			});
			expect(result.rejections).toEqual([
				{ clientId: BAD_PEER_ID, reason: "wrong-typed" },
			]);
		}
	});

	it("COL2: out-of-range-offset ignored — cursor past the block length is dropped", () => {
		const result = validate([
			[
				BAD_PEER_ID,
				{
					user: { id: "u-bad", name: "Ada" },
					cursor: { blockId: "b1", offset: 99 },
				},
			],
		]);

		expect(result.states.get(BAD_PEER_ID)).toEqual({
			user: { id: "u-bad", name: "Ada" },
			cursor: null,
			selection: null,
		});
		expect(result.rejections).toEqual([
			{ clientId: BAD_PEER_ID, reason: "out-of-range-offset" },
		]);
	});

	it("COL2: hostile avatar URL ignored — javascript: and data:text/html drop the peer", () => {
		const cases: unknown[] = [
			{
				user: {
					id: "u-bad",
					name: "Ada",
					avatar: "javascript:alert(1)",
				},
			},
			{
				user: {
					id: "u-bad",
					name: "Ada",
					avatar: "data:text/html,<script>window.__xssProbe=1</script>",
				},
			},
		];

		for (const state of cases) {
			const result = validate([[BAD_PEER_ID, state]]);
			expect(result.states.has(BAD_PEER_ID)).toBe(false);
			expect(result.rejections).toEqual([
				{ clientId: BAD_PEER_ID, reason: "script-bearing" },
			]);
		}
	});

	it("COL2: oversized/wrong-typed ignored — a valid peer still appears beside rejected peers", () => {
		const result = validate([
			[LOCAL_CLIENT_ID, { user: { id: "local", name: "Ada" } }],
			[GOOD_PEER_ID, validPeer],
			[
				BAD_PEER_ID,
				{
					user: { id: "u-bad", name: "TooBig" },
					padding: "x".repeat(MAX_PRESENCE_BYTES_PER_PEER),
				},
			],
			[99, null],
		]);

		expect([...result.states.keys()]).toEqual([
			LOCAL_CLIENT_ID,
			GOOD_PEER_ID,
		]);
		expect(result.states.get(GOOD_PEER_ID)).toEqual({
			user: validPeer.user,
			cursor: validPeer.cursor,
			selection: validPeer.selection,
		});
		expect(result.rejections).toEqual([
			{ clientId: BAD_PEER_ID, reason: "oversized" },
			{ clientId: 99, reason: "wrong-typed" },
		]);
	});

	it("COL2: oversized and wrong-typed presence emit diagnostics and do not break good peers", () => {
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
			[
				100,
				{
					user: { id: 2, name: "Invalid" },
					cursor: { blockId: "b1", offset: 1, clock: 11 },
				} as unknown as MultiplayerAwarenessState,
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
		expect(
			controller.getRemoteCursors().map((cursor) => cursor.clientId),
		).toEqual([GOOD_PEER_ID]);
		expect(rejectedReasons(diagnostics)).toEqual([
			"oversized",
			"oversized",
			"wrong-typed",
		]);
		expect((globalThis as { __xssProbe?: unknown }).__xssProbe).toBeUndefined();

		editor.destroy();
	});

	it("COL2: script-bearing presence is dropped with a diagnostic and does not break good peers", () => {
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
		expect(
			controller.getRemoteCursors().map((cursor) => cursor.clientId),
		).toEqual([GOOD_PEER_ID]);
		expect(rejectedReasons(diagnostics)).toEqual(["script-bearing"]);
		expect((globalThis as { __xssProbe?: unknown }).__xssProbe).toBeUndefined();

		editor.destroy();
	});

	it("COL2: nonexistent-block presence is dropped with a diagnostic and does not break good peers", () => {
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
		expect(
			controller.getRemoteCursors().map((cursor) => cursor.clientId),
		).toEqual([GOOD_PEER_ID]);
		expect(controller.getRemoteSelections()).toEqual([]);
		expect(
			controller.getPeers().some((peer) => peer.clientId === BAD_PEER_ID),
		).toBe(true);
		expect(rejectedReasons(diagnostics)).toEqual(["nonexistent-block"]);
		expect((globalThis as { __xssProbe?: unknown }).__xssProbe).toBeUndefined();

		editor.destroy();
	});

	it("COL2: peer cap counts extra peers and keeps already-tracked presence rendering", () => {
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

	it("COL2: out-of-range-offset presence is dropped with a diagnostic and does not break good peers", () => {
		const { editor, controller, diagnostics } = createPresenceEditor();

		expect(() => {
			applyStates(controller, editor, [
				[GOOD_PEER_ID, goodPeerState()],
				[
					BAD_PEER_ID,
					{
						user: { id: "u-far", name: "Far", color: "#abc123" },
						cursor: { blockId: "b1", offset: 99, clock: 11 },
					},
				],
			]);
		}).not.toThrow();

		expect(goodPeerDecoration(editor)?.attributes?.["data-user-id"]).toBe(
			"u-good",
		);
		expect(
			controller.getRemoteCursors().map((cursor) => cursor.clientId),
		).toEqual([GOOD_PEER_ID]);
		expect(rejectedReasons(diagnostics)).toEqual(["out-of-range-offset"]);

		editor.destroy();
	});

	it("COL2: hostile avatar URL is dropped with a diagnostic and does not break good peers", () => {
		const { editor, controller, diagnostics } = createPresenceEditor();

		expect(() => {
			applyStates(controller, editor, [
				[GOOD_PEER_ID, goodPeerState()],
				[
					BAD_PEER_ID,
					{
						user: {
							id: "u-js",
							name: "Hostile",
							avatar: "javascript:alert(1)",
						},
						cursor: { blockId: "b1", offset: 1, clock: 11 },
					},
				],
				[
					99,
					{
						user: {
							id: "u-html",
							name: "Hostile",
							avatar: "data:text/html,<script>window.__xssProbe=1</script>",
						},
						cursor: { blockId: "b1", offset: 1, clock: 12 },
					},
				],
			]);
		}).not.toThrow();

		expect(goodPeerDecoration(editor)?.attributes?.["data-user-id"]).toBe(
			"u-good",
		);
		expect(
			controller.getRemoteCursors().map((cursor) => cursor.clientId),
		).toEqual([GOOD_PEER_ID]);
		expect(rejectedReasons(diagnostics)).toEqual([
			"script-bearing",
			"script-bearing",
		]);
		expect((globalThis as { __xssProbe?: unknown }).__xssProbe).toBeUndefined();

		editor.destroy();
	});

	it("COL2: peer-cap flood stays at MAX_TRACKED_PEERS and never throws", () => {
		const { editor, controller, diagnostics } = createPresenceEditor();
		const floodCount = MAX_TRACKED_PEERS * 64;
		const entries: Array<[number, MultiplayerAwarenessState]> = [];
		for (let index = 0; index < floodCount; index += 1) {
			entries.push([
				100 + index,
				{
					user: { id: `u-${index}`, name: `Peer ${index}`, color: "#abc123" },
					cursor: { blockId: "b1", offset: 1, clock: index },
				},
			]);
		}

		expect(() => {
			applyStates(controller, editor, entries);
		}).not.toThrow();

		expect(controller.getRemoteCursors()).toHaveLength(MAX_TRACKED_PEERS);
		expect(controller.getPeers()).toHaveLength(MAX_TRACKED_PEERS);
		expect(
			diagnostics.find((event) => event.reason === "peer-cap")
				?.untrackedPeerCount,
		).toBe(floodCount - MAX_TRACKED_PEERS);

		applyStates(controller, editor, [
			[
				100,
				{
					user: { id: "u-0", name: "Peer 0", color: "#abc123" },
					cursor: { blockId: "b1", offset: 3, clock: 9_001 },
				},
			],
			...entries.slice(1),
		]);
		expect(
			controller.getRemoteCursors().find((cursor) => cursor.clientId === 100)
				?.offset,
		).toBe(3);
		expect(controller.getRemoteCursors()).toHaveLength(MAX_TRACKED_PEERS);
		expect(controller.getPeers()).toHaveLength(MAX_TRACKED_PEERS);

		editor.destroy();
	});

	it("COL2: per-peer update rate limit keeps the last accepted presence", () => {
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

	it("COL2: rate-limit flood keeps one cursor and never throws", () => {
		let now = 1_000_000;
		const { editor, controller, diagnostics } = createPresenceEditor(() => now);
		const floodCount = MAX_PRESENCE_UPDATES_PER_SECOND * 64;

		expect(() => {
			for (let index = 0; index < floodCount; index += 1) {
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
		}).not.toThrow();

		expect(controller.getRemoteCursors()).toHaveLength(1);
		expect(controller.getPeers()).toHaveLength(1);
		expect(
			diagnostics.filter((event) => event.reason === "rate-limited").length,
		).toBe(floodCount - MAX_PRESENCE_UPDATES_PER_SECOND);
		expect(controller.getRemoteCursors()[0]?.clock).toBeLessThan(
			MAX_PRESENCE_UPDATES_PER_SECOND,
		);

		editor.destroy();
	});
});
