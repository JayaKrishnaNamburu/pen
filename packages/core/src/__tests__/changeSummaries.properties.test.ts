import { describe, expect, it } from "vitest";

import {
	applySummaryToSnapshot,
	createBlockIndexSnapshot,
	type BlockIndexSnapshot,
} from "../changes/blockIndex";
import { createChangeSummary } from "../changes/mapping";
import { buildChangeSummary } from "../changes/summaryBuilder";
import type {
	Assoc,
	ChangeSummary,
	Point,
	PointMapMode,
} from "../changes/types";
import type { RawCommitDelta } from "@input/pen-crdt-yjs";

const SEED = Number(process.env.PEN_FUZZ_SEED ?? 20260819);
const OP_COUNT = process.env.PEN_FUZZ_NIGHTLY ? 1_000_000 : 10_000;

const MODES: PointMapMode[] = [
	"clamp",
	"delete",
	"delete-before",
	"delete-after",
];
const ASSOCS: Assoc[] = [-1, 1];

class Rng {
	private state: number;

	constructor(seed: number) {
		this.state = seed >>> 0;
	}

	next(): number {
		this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
		return this.state / 0x100000000;
	}

	int(max: number): number {
		if (max <= 0) return 0;
		return Math.floor(this.next() * max);
	}

	pick<T>(items: readonly T[]): T {
		return items[this.int(items.length)]!;
	}
}

const KINDS = [
	"insert-text",
	"delete-text",
	"replace-text",
	"insert-block",
	"remove-block",
	"move-block",
	"convert-block",
	"split-block",
	"merge-blocks",
	"props",
	"table",
	"layout",
	"apps",
	"metadata",
] as const;

function initialSnapshot(): BlockIndexSnapshot {
	return createBlockIndexSnapshot({
		roots: ["a", "b", "c"],
		lengthById: { a: 8, b: 5, c: 3, nest: 0, child: 4 },
		typeById: {
			a: "paragraph",
			b: "paragraph",
			c: "paragraph",
			nest: "column",
			child: "paragraph",
		},
		childrenByParentId: new Map<string | null, readonly string[]>([
			[null, ["a", "b", "c", "nest"]],
			["nest", ["child"]],
		]),
	});
}

function emptyDelta(overrides: Partial<RawCommitDelta> = {}): RawCommitDelta {
	return {
		originTag: "user",
		textDeltas: new Map(),
		blockOrderDelta: [],
		childArrayDeltas: new Map(),
		blockMapChanges: new Map(),
		appChanges: new Set(),
		metadataChanges: new Set(),
		...overrides,
	};
}

function livingIds(snapshot: BlockIndexSnapshot): string[] {
	return snapshot.order.filter((id) => snapshot.lengthById.has(id));
}

function randomSummary(
	rng: Rng,
	snapshot: BlockIndexSnapshot,
	commitId: number,
): ChangeSummary {
	const kind = rng.pick(KINDS);
	const ids = livingIds(snapshot);
	const blockId = rng.pick(ids);
	const length = snapshot.lengthById.get(blockId) ?? 0;

	if (kind === "insert-text") {
		const from = rng.int(length + 1);
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [
				{
					blockId,
					splices: [{ from, to: from, insertLength: rng.int(4) + 1 }],
					formatRanges: [],
				},
			],
			structural: [],
			index: snapshot,
		});
	}

	if (kind === "delete-text" && length > 0) {
		const from = rng.int(length);
		const to = from + rng.int(length - from) + 1;
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [
				{
					blockId,
					splices: [{ from, to, insertLength: 0 }],
					formatRanges: [],
				},
			],
			structural: [],
			index: snapshot,
		});
	}

	if (kind === "replace-text" && length > 0) {
		const from = rng.int(length);
		const to = from + rng.int(length - from) + 1;
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [
				{
					blockId,
					splices: [{ from, to, insertLength: rng.int(3) + 1 }],
					formatRanges: [],
				},
			],
			structural: [],
			index: snapshot,
		});
	}

	if (kind === "insert-block" && ids.length < 10) {
		const parentId = rng.next() < 0.3 ? "nest" : null;
		const siblings =
			snapshot.childrenByParentId.get(parentId) ?? snapshot.roots;
		const newId = `n${commitId}`;
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [
				{
					type: "block-inserted",
					blockId: newId,
					parentId,
					index: rng.int(siblings.length + 1),
				},
			],
			index: snapshot,
		});
	}

	if (kind === "remove-block" && ids.length > 2) {
		const removable = ids.filter((id) => id !== "nest");
		const target = rng.pick(removable);
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [
				{
					type: "block-removed",
					blockId: target,
					parentId: snapshot.parentById.get(target) ?? null,
					index: Math.max(
						0,
						(
							snapshot.childrenByParentId.get(
								snapshot.parentById.get(target) ?? null,
							) ?? []
						).indexOf(target),
					),
				},
			],
			index: snapshot,
		});
	}

	if (kind === "move-block" && ids.length > 2) {
		const moving = rng.pick(ids.filter((id) => id !== "nest"));
		const fromParentId = snapshot.parentById.get(moving) ?? null;
		const toParentId =
			fromParentId === null && rng.next() < 0.3 ? "nest" : null;
		const toSiblings =
			snapshot.childrenByParentId.get(toParentId) ?? snapshot.roots;
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [
				{
					type: "block-moved",
					blockId: moving,
					fromParentId,
					fromIndex: Math.max(
						0,
						(
							snapshot.childrenByParentId.get(fromParentId) ?? []
						).indexOf(moving),
					),
					toParentId,
					toIndex: rng.int(toSiblings.length + 1),
				},
			],
			index: snapshot,
		});
	}

	if (kind === "convert-block") {
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [
				{
					type: "block-converted",
					blockId,
					fromType: snapshot.typeById.get(blockId) ?? "paragraph",
					toType: rng.pick(["paragraph", "heading", "quote"]),
				},
			],
			index: snapshot,
		});
	}

	if (kind === "split-block" && length > 0 && ids.length < 10) {
		const offset = rng.int(length + 1);
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [
				{
					type: "block-split",
					blockId,
					newBlockId: `s${commitId}`,
					offset,
				},
			],
			index: snapshot,
		});
	}

	if (kind === "merge-blocks") {
		const roots = snapshot.roots.filter(
			(id) => (snapshot.lengthById.get(id) ?? 0) >= 0,
		);
		if (roots.length >= 2) {
			const targetBlockId = roots[0]!;
			const sourceBlockId = roots[1]!;
			if (targetBlockId !== sourceBlockId) {
				return createChangeSummary({
					commitId,
					originType: "user",
					text: [],
					structural: [
						{
							type: "blocks-merged",
							targetBlockId,
							sourceBlockId,
							joinOffset:
								snapshot.lengthById.get(targetBlockId) ?? 0,
						},
					],
					index: snapshot,
				});
			}
		}
	}

	if (kind === "props") {
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [
				{ type: "block-props-changed", blockId, keys: ["align"] },
			],
			index: snapshot,
		});
	}

	if (kind === "table") {
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [{ type: "table-changed", blockId }],
			index: snapshot,
		});
	}

	if (kind === "layout") {
		return buildChangeSummary(
			emptyDelta({
				childArrayDeltas: new Map([
					["nest", [{ insert: [`l${commitId}`] }]],
				]),
			}),
			snapshot,
			commitId,
		);
	}

	if (kind === "apps") {
		return createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [{ type: "apps-changed", appIds: [`app-${commitId}`] }],
			index: snapshot,
		});
	}

	return createChangeSummary({
		commitId,
		originType: "user",
		text: [],
		structural: [{ type: "metadata-changed", namespaces: ["title"] }],
		index: snapshot,
	});
}

function prePoints(snapshot: BlockIndexSnapshot): Point[] {
	const points: Point[] = [];
	for (const blockId of livingIds(snapshot)) {
		const length = snapshot.lengthById.get(blockId) ?? 0;
		for (let offset = 0; offset <= length; offset++) {
			points.push({ blockId, offset });
		}
	}
	return points;
}

function isValidPost(point: Point, snapshot: BlockIndexSnapshot): boolean {
	if (!snapshot.lengthById.has(point.blockId)) return false;
	const length = snapshot.lengthById.get(point.blockId) ?? 0;
	return point.offset >= 0 && point.offset <= length;
}

function expectedComposed(
	first: ChangeSummary,
	second: ChangeSummary,
	point: Point,
	assoc: Assoc,
	mode: PointMapMode,
): Point | null {
	if (mode !== "clamp") {
		const tracked = first.mapPoint(point, assoc, mode);
		if (tracked == null) return null;
	}
	const mid = first.mapPoint(point, assoc, "clamp");
	if (mid == null) return null;
	return second.mapPoint(mid, assoc, mode);
}

describe("change summary properties", () => {
	it("I2: every valid pre-commit point maps to a valid post-commit point or null", { timeout: 60_000 }, () => {
		const rng = new Rng(SEED);
		let snapshot = initialSnapshot();
		let mapped = 0;

		for (let i = 1; i <= OP_COUNT; i++) {
			const summary = randomSummary(rng, snapshot, i);
			const post = applySummaryToSnapshot(snapshot, summary);
			for (const point of prePoints(snapshot)) {
				const clamp = summary.mapPoint(point, 1, "clamp");
				expect(
					clamp,
					`I2 clamp ${i} ${point.blockId}:${point.offset}`,
				).not.toBeNull();
				if (clamp) {
					expect(
						isValidPost(clamp, post),
						`I2 ${i} ${point.blockId}:${point.offset} → ${clamp.blockId}:${clamp.offset}`,
					).toBe(true);
				}

				for (const mode of MODES) {
					if (mode === "clamp") continue;
					const tracked = summary.mapPoint(point, 1, mode);
					if (tracked) expect(isValidPost(tracked, post)).toBe(true);
				}
				mapped += 1;
			}
			snapshot = post;
			if (livingIds(snapshot).length === 0) snapshot = initialSnapshot();
		}

		expect(mapped).toBeGreaterThan(0);
	});

	it("I3: compose-then-map equals map-then-map", { timeout: 60_000 }, () => {
		const rng = new Rng(SEED + 1);
		let snapshot = initialSnapshot();
		let compared = 0;

		for (let i = 1; i <= OP_COUNT; i += 2) {
			const first = randomSummary(rng, snapshot, i);
			const midSnap = applySummaryToSnapshot(snapshot, first);
			const second = randomSummary(rng, midSnap, i + 1);
			const composed = first.compose(second);

			for (const point of prePoints(snapshot)) {
				for (const assoc of ASSOCS) {
					for (const mode of MODES) {
						const through = expectedComposed(
							first,
							second,
							point,
							assoc,
							mode,
						);
						const once = composed.mapPoint(point, assoc, mode);
						expect(once).toEqual(through);
						compared += 1;
					}
				}
			}

			snapshot = applySummaryToSnapshot(midSnap, second);
			if (livingIds(snapshot).length === 0) snapshot = initialSnapshot();
		}

		expect(compared).toBeGreaterThan(0);
	});
});

describe("change summary structural coverage", () => {
	it("property generator samples every structural group", () => {
		expect(KINDS).toEqual(
			expect.arrayContaining([
				"insert-text",
				"delete-text",
				"insert-block",
				"remove-block",
				"move-block",
				"convert-block",
				"split-block",
				"merge-blocks",
				"props",
				"table",
				"layout",
				"apps",
				"metadata",
			]),
		);
	});
});
