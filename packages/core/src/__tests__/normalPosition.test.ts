import { describe, expect, it } from "vitest";

import {
	isNormalPosition,
	nextNormalPosition,
	snapToNormalPosition,
	type NormalPositionBlock,
	type NormalPositionSnapshot,
} from "../selection/normalPosition";

function snapshot(
	blocks: Array<NormalPositionBlock & { id: string }>,
): NormalPositionSnapshot {
	const record: Record<string, NormalPositionBlock> = {};
	const blockOrder: string[] = [];
	for (const entry of blocks) {
		blockOrder.push(entry.id);
		record[entry.id] = {
			kind: entry.kind,
			text: entry.text,
			atoms: entry.atoms,
		};
	}
	return { blockOrder, blocks: record };
}

const family = "👨‍👩‍👧‍👦";
const familyText = `a${family}b`;
const familyEnd = 1 + family.length;

const graphemeDoc = snapshot([
	{ id: "p1", kind: "text", text: "hello" },
	{ id: "empty", kind: "text", text: "" },
	{ id: "marks", kind: "text", text: "cafe\u0301s" },
	{ id: "emoji", kind: "text", text: familyText },
]);

const atomDoc = snapshot([
	{
		id: "embed",
		kind: "text",
		text: "aXb",
		atoms: [{ start: 1, end: 2 }],
	},
	{
		id: "wide",
		kind: "text",
		text: "hello",
		atoms: [{ start: 1, end: 4 }],
	},
	{
		id: "tail",
		kind: "text",
		text: "abXXX",
		atoms: [{ start: 2, end: 5 }],
	},
]);

const mixedDoc = snapshot([
	{ id: "a", kind: "text", text: "hi" },
	{ id: "img", kind: "structural", text: "" },
	{ id: "b", kind: "text", text: "yo" },
]);

describe("nextNormalPosition", () => {
	describe("N1", () => {
		it("N1: steps one ascii grapheme and stays in the same block", () => {
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "p1", offset: 2 },
					1,
				),
			).toEqual({ blockId: "p1", offset: 3 });
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "p1", offset: 2 },
					-1,
				),
			).toEqual({ blockId: "p1", offset: 1 });
		});

		it("N1: combining marks stay with their base", () => {
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "marks", offset: 3 },
					1,
				),
			).toEqual({ blockId: "marks", offset: 5 });
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "marks", offset: 5 },
					-1,
				),
			).toEqual({ blockId: "marks", offset: 3 });
		});

		it("N1 Wave5: emoji ZWJ family is one grapheme step", () => {
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "emoji", offset: 1 },
					1,
				),
			).toEqual({ blockId: "emoji", offset: familyEnd });
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "emoji", offset: familyEnd },
					-1,
				),
			).toEqual({ blockId: "emoji", offset: 1 });
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "emoji", offset: 5 },
					1,
				),
			).toEqual({ blockId: "emoji", offset: familyEnd });
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "emoji", offset: 5 },
					-1,
				),
			).toEqual({ blockId: "emoji", offset: 1 });
		});

		it("N1: empty text block has one position; a step yields blockBoundary", () => {
			expect(
				isNormalPosition(graphemeDoc, { blockId: "empty", offset: 0 }),
			).toBe(true);
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "empty", offset: 0 },
					1,
				),
			).toEqual({ blockBoundary: "empty" });
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "empty", offset: 0 },
					-1,
				),
			).toEqual({ blockBoundary: "empty" });
		});

		it("N1: both sides of a one-offset embed are normal; the interior does not exist", () => {
			expect(
				isNormalPosition(atomDoc, { blockId: "embed", offset: 1 }),
			).toBe(true);
			expect(
				isNormalPosition(atomDoc, { blockId: "embed", offset: 2 }),
			).toBe(true);
			expect(
				nextNormalPosition(
					atomDoc,
					{ blockId: "embed", offset: 1 },
					1,
				),
			).toEqual({ blockId: "embed", offset: 2 });
			expect(
				nextNormalPosition(
					atomDoc,
					{ blockId: "embed", offset: 2 },
					-1,
				),
			).toEqual({ blockId: "embed", offset: 1 });
		});

		it("N1: offsets strictly inside an atom extent are not normal", () => {
			expect(
				isNormalPosition(atomDoc, { blockId: "wide", offset: 1 }),
			).toBe(true);
			expect(
				isNormalPosition(atomDoc, { blockId: "wide", offset: 2 }),
			).toBe(false);
			expect(
				isNormalPosition(atomDoc, { blockId: "wide", offset: 3 }),
			).toBe(false);
			expect(
				isNormalPosition(atomDoc, { blockId: "wide", offset: 4 }),
			).toBe(true);
		});

		it("N1: stepping from an atom side skips the interior", () => {
			expect(
				nextNormalPosition(atomDoc, { blockId: "wide", offset: 1 }, 1),
			).toEqual({ blockId: "wide", offset: 4 });
			expect(
				nextNormalPosition(atomDoc, { blockId: "wide", offset: 4 }, -1),
			).toEqual({ blockId: "wide", offset: 1 });
		});

		it("N1: emerging at the block end stays a text point, not a boundary", () => {
			expect(
				nextNormalPosition(atomDoc, { blockId: "tail", offset: 3 }, 1),
			).toEqual({ blockId: "tail", offset: 5 });
			expect(
				nextNormalPosition(atomDoc, { blockId: "tail", offset: 5 }, 1),
			).toEqual({ blockBoundary: "tail" });
		});

		it("N1: snapToNormalPosition identity leaves a normal point unchanged", () => {
			const point = { blockId: "p1", offset: 2 };
			expect(snapToNormalPosition(graphemeDoc, point, 1)).toEqual(point);
			expect(snapToNormalPosition(graphemeDoc, point, -1)).toEqual(point);
		});

		it("N1: snapToNormalPosition uses assoc toward the atom side", () => {
			expect(
				snapToNormalPosition(
					atomDoc,
					{ blockId: "wide", offset: 2 },
					1,
				),
			).toEqual({ blockId: "wide", offset: 4 });
			expect(
				snapToNormalPosition(
					atomDoc,
					{ blockId: "wide", offset: 3 },
					-1,
				),
			).toEqual({ blockId: "wide", offset: 1 });
		});
	});

	describe("N2", () => {
		it("N2: non-text blocks have no text positions; a step is blockBoundary, not 0..1", () => {
			expect(
				isNormalPosition(mixedDoc, { blockId: "img", offset: 0 }),
			).toBe(false);
			expect(
				nextNormalPosition(mixedDoc, { blockId: "img", offset: 0 }, 1),
			).toEqual({ blockBoundary: "img" });
			expect(
				nextNormalPosition(mixedDoc, { blockId: "img", offset: 1 }, -1),
			).toEqual({ blockBoundary: "img" });
			expect(
				snapToNormalPosition(
					mixedDoc,
					{ blockId: "img", offset: 0 },
					1,
				),
			).toEqual({ blockBoundary: "img" });
		});
	});

	describe("N3", () => {
		it("N3: never returns a text point in a different block", () => {
			const result = nextNormalPosition(
				mixedDoc,
				{ blockId: "a", offset: 2 },
				1,
			);

			expect(result).toEqual({ blockBoundary: "a" });
			expect(result).not.toEqual({ blockId: "b", offset: 0 });
			expect(result).not.toEqual({ blockId: "img", offset: 0 });
		});
	});

	describe("5.3", () => {
		it("5.3: offset 0 / length yields blockBoundary; commands own entry and stop", () => {
			expect(
				nextNormalPosition(mixedDoc, { blockId: "a", offset: 2 }, 1),
			).toEqual({ blockBoundary: "a" });
			expect(
				nextNormalPosition(mixedDoc, { blockId: "a", offset: 0 }, -1),
			).toEqual({ blockBoundary: "a" });
			expect(
				nextNormalPosition(mixedDoc, { blockId: "b", offset: 0 }, -1),
			).toEqual({ blockBoundary: "b" });
			expect(
				nextNormalPosition(mixedDoc, { blockId: "b", offset: 2 }, 1),
			).toEqual({ blockBoundary: "b" });
		});

		it("5.3: document-edge boundaries stay markers", () => {
			const only = snapshot([{ id: "only", kind: "text", text: "x" }]);

			expect(
				nextNormalPosition(only, { blockId: "only", offset: 0 }, -1),
			).toEqual({ blockBoundary: "only" });
			expect(
				nextNormalPosition(only, { blockId: "only", offset: 1 }, 1),
			).toEqual({ blockBoundary: "only" });
		});

		it("5.3: unknown block is null", () => {
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "missing", offset: 0 },
					1,
				),
			).toBeNull();
			expect(
				snapToNormalPosition(
					graphemeDoc,
					{ blockId: "missing", offset: 0 },
					1,
				),
			).toBeNull();
			expect(
				isNormalPosition(graphemeDoc, {
					blockId: "missing",
					offset: 0,
				}),
			).toBe(false);
		});

		it("5.3: nextNormalPosition over atoms and empty blocks stays in-block", () => {
			expect(
				nextNormalPosition(
					graphemeDoc,
					{ blockId: "empty", offset: 0 },
					1,
				),
			).toEqual({ blockBoundary: "empty" });
			expect(
				nextNormalPosition(atomDoc, { blockId: "wide", offset: 2 }, 1),
			).toEqual({ blockId: "wide", offset: 4 });
		});
	});
});
