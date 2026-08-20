import { describe, expect, it } from "vitest";
import { validateAwarenessStates } from "../presence/awarenessValidator";
import {
	MAX_PRESENCE_AVATAR_URL_LENGTH,
	MAX_PRESENCE_BLOCK_SELECTION_IDS,
	MAX_PRESENCE_BYTES_PER_PEER,
	MAX_PRESENCE_DISPLAY_NAME_LENGTH,
	MAX_PRESENCE_USER_ID_LENGTH,
} from "../presence/constants";

const LOCAL_CLIENT_ID = 1;
const GOOD_PEER_ID = 77;
const BAD_PEER_ID = 88;

const document = {
	blockLength(blockId: string): number | null {
		return blockId === "b1" ? 5 : null;
	},
};

function validate(states: Array<[number, unknown]>) {
	return validateAwarenessStates(
		new Map(states),
		document,
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

describe("COL2 leftover awareness validation", () => {
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
			withOwnKey(
				{ user: { id: "u-bad", name: "Ada" } },
				"__proto__",
				{},
			),
			withOwnKey(
				{ user: { id: "u-bad", name: "Ada" } },
				"constructor",
				{},
			),
			withOwnKey(
				{ user: { id: "u-bad", name: "Ada" } },
				"prototype",
				{},
			),
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
				user: withOwnKey(
					{ id: "u-bad", name: "Ada" },
					"__proto__",
					{},
				),
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
				[
					BAD_PEER_ID,
					{ user: { id: "u-bad", name: "Ada" }, cursor },
				],
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
			{ kind: "range", anchor: validPeer.selection.anchor, head: validPeer.selection.head },
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
				[
					BAD_PEER_ID,
					{ user: { id: "u-bad", name: "Ada" }, selection },
				],
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
});
