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

const NIGHTLY = Boolean(process.env.PEN_FUZZ_NIGHTLY);
const SEED_INFO = parseFuzzSeed(process.env.PEN_FUZZ_SEED);
const SEED = SEED_INFO.numeric;
const OP_COUNT = resolveOpCount();
const FORCE_FAIL_AT = Number(process.env.PEN_FUZZ_FORCE_FAIL_AT);

const MODES: PointMapMode[] = [
	"clamp",
	"delete",
	"delete-before",
	"delete-after",
];
const ASSOCS: Assoc[] = [-1, 1];
const I2_ASSOCS: readonly Assoc[] = NIGHTLY ? ASSOCS : [1];

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

// Document-text alphabet. Change summaries store insertLength, not glyphs, so
// the only way RTL/graphemes affect this suite is by producing UTF-16 lengths
// and a parallel string model those lengths must match.
//
// no-bidi-override (scripts/no-bidi-override.mjs) forbids CSS
// `unicode-bidi: bidi-override` in packages/rendering — not these characters.
// LRM/RLM and the isolates are valid paste; LRE/RLE/LRO/RLO/PDF (U+202A–U+202E)
// are omitted because they are the Unicode override model isolates replaced.
const HEBREW = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ש", "ל", "ם", "ת"];
const ARABIC = ["ا", "ب", "ت", "ث", "ع", "ر", "ي", "ة", "م", "ح"];
const LATIN = ["a", "b", "c", "e", "i", "m", "o", "w"];
const NEUTRALS = [" ", ".", ",", ":", "-", "(", ")"];
const DIGITS = ["0", "1", "2", "3", "4", "7", "9"];
const BIDI_MARKS = ["\u200E", "\u200F"];
const BIDI_ISOLATES = ["\u2066", "\u2067", "\u2068", "\u2069"];
const MIXED = ["שלום 42", "42 مرحبا", "Re: עברית", "Hi م", "ש4", "2م"];
const GRAPHEMES = ["é", "e\u0301", "🙂"];
const NIGHTLY_ATOMS = [
	"\u061C",
	"٠",
	"١",
	"٢",
	"نَ",
	"👨‍👩‍👧‍👦",
	"🇺🇸",
	"a\u0301\u0302",
];

const ATOMS = NIGHTLY
	? [
			...HEBREW,
			...ARABIC,
			...LATIN,
			...NEUTRALS,
			...DIGITS,
			...BIDI_MARKS,
			...BIDI_ISOLATES,
			...MIXED,
			...GRAPHEMES,
			...NIGHTLY_ATOMS,
		]
	: [
			...HEBREW,
			...ARABIC,
			...LATIN,
			...NEUTRALS,
			...DIGITS,
			...BIDI_MARKS,
			...BIDI_ISOLATES,
			...MIXED,
			...GRAPHEMES,
		];

interface GeneratedChange {
	readonly summary: ChangeSummary;
	readonly spliced: readonly {
		readonly blockId: string;
		readonly from: number;
		readonly to: number;
		readonly insert: string;
	}[];
}

function parseFuzzSeed(raw: string | undefined): { raw: string; numeric: number } {
	const source = raw && raw.length > 0 ? raw : "20260819";
	const asNumber = Number(source);
	if (Number.isFinite(asNumber)) {
		return { raw: source, numeric: asNumber >>> 0 };
	}
	let hash = 2166136261;
	for (let i = 0; i < source.length; i++) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return { raw: source, numeric: hash >>> 0 };
}

function resolveOpCount(): number {
	const override = Number(process.env.PEN_FUZZ_OP_COUNT);
	if (Number.isFinite(override) && override > 0) return Math.floor(override);
	return NIGHTLY ? 1_000_000 : 10_000;
}

function randomInsert(rng: Rng): string {
	const atomCount = rng.int(NIGHTLY ? 4 : 3) + 1;
	let text = "";
	for (let i = 0; i < atomCount; i++) {
		text += rng.pick(ATOMS);
	}
	return text;
}

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

function initialTexts(): Map<string, string> {
	return new Map([
		["a", "مرحبا Hi"],
		["b", "שלום!"],
		["c", "42א"],
		["nest", ""],
		["child", "a🙂."],
	]);
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

function generated(
	summary: ChangeSummary,
	spliced: GeneratedChange["spliced"] = [],
): GeneratedChange {
	return { summary, spliced };
}

function randomSummary(
	rng: Rng,
	snapshot: BlockIndexSnapshot,
	commitId: number,
): GeneratedChange {
	const kind = rng.pick(KINDS);
	const ids = livingIds(snapshot);
	const blockId = rng.pick(ids);
	const length = snapshot.lengthById.get(blockId) ?? 0;

	if (kind === "insert-text") {
		const from = rng.int(length + 1);
		const insert = randomInsert(rng);
		return generated(
			createChangeSummary({
				commitId,
				originType: "user",
				text: [
					{
						blockId,
						splices: [{ from, to: from, insertLength: insert.length }],
						formatRanges: [],
					},
				],
				structural: [],
				index: snapshot,
			}),
			[{ blockId, from, to: from, insert }],
		);
	}

	if (kind === "delete-text" && length > 0) {
		const from = rng.int(length);
		const to = from + rng.int(length - from) + 1;
		return generated(
			createChangeSummary({
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
			}),
			[{ blockId, from, to, insert: "" }],
		);
	}

	if (kind === "replace-text" && length > 0) {
		const from = rng.int(length);
		const to = from + rng.int(length - from) + 1;
		const insert = randomInsert(rng);
		return generated(
			createChangeSummary({
				commitId,
				originType: "user",
				text: [
					{
						blockId,
						splices: [{ from, to, insertLength: insert.length }],
						formatRanges: [],
					},
				],
				structural: [],
				index: snapshot,
			}),
			[{ blockId, from, to, insert }],
		);
	}

	if (kind === "insert-block" && ids.length < 10) {
		const parentId = rng.next() < 0.3 ? "nest" : null;
		const siblings =
			snapshot.childrenByParentId.get(parentId) ?? snapshot.roots;
		const newId = `n${commitId}`;
		return generated(
			createChangeSummary({
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
			}),
		);
	}

	if (kind === "remove-block" && ids.length > 2) {
		const removable = ids.filter((id) => id !== "nest");
		const target = rng.pick(removable);
		return generated(
			createChangeSummary({
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
			}),
		);
	}

	if (kind === "move-block" && ids.length > 2) {
		const moving = rng.pick(ids.filter((id) => id !== "nest"));
		const fromParentId = snapshot.parentById.get(moving) ?? null;
		const toParentId =
			fromParentId === null && rng.next() < 0.3 ? "nest" : null;
		const toSiblings =
			snapshot.childrenByParentId.get(toParentId) ?? snapshot.roots;
		return generated(
			createChangeSummary({
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
			}),
		);
	}

	if (kind === "convert-block") {
		return generated(
			createChangeSummary({
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
			}),
		);
	}

	if (kind === "split-block" && length > 0 && ids.length < 10) {
		const offset = rng.int(length + 1);
		return generated(
			createChangeSummary({
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
			}),
		);
	}

	if (kind === "merge-blocks") {
		const roots = snapshot.roots.filter(
			(id) => (snapshot.lengthById.get(id) ?? 0) >= 0,
		);
		if (roots.length >= 2) {
			const targetBlockId = roots[0]!;
			const sourceBlockId = roots[1]!;
			if (targetBlockId !== sourceBlockId) {
				return generated(
					createChangeSummary({
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
					}),
				);
			}
		}
	}

	if (kind === "props") {
		return generated(
			createChangeSummary({
				commitId,
				originType: "user",
				text: [],
				structural: [
					{ type: "block-props-changed", blockId, keys: ["align"] },
				],
				index: snapshot,
			}),
		);
	}

	if (kind === "table") {
		return generated(
			createChangeSummary({
				commitId,
				originType: "user",
				text: [],
				structural: [{ type: "table-changed", blockId }],
				index: snapshot,
			}),
		);
	}

	if (kind === "layout") {
		return generated(
			buildChangeSummary(
				emptyDelta({
					childArrayDeltas: new Map([
						["nest", [{ insert: [`l${commitId}`] }]],
					]),
				}),
				snapshot,
				commitId,
			),
		);
	}

	if (kind === "apps") {
		return generated(
			createChangeSummary({
				commitId,
				originType: "user",
				text: [],
				structural: [{ type: "apps-changed", appIds: [`app-${commitId}`] }],
				index: snapshot,
			}),
		);
	}

	return generated(
		createChangeSummary({
			commitId,
			originType: "user",
			text: [],
			structural: [{ type: "metadata-changed", namespaces: ["title"] }],
			index: snapshot,
		}),
	);
}

function applyGeneratedToTexts(
	texts: Map<string, string>,
	change: GeneratedChange,
): Map<string, string> {
	const next = new Map(texts);
	for (const structural of change.summary.structural) {
		switch (structural.type) {
			case "block-inserted":
				if (!next.has(structural.blockId)) next.set(structural.blockId, "");
				break;
			case "block-removed":
				next.delete(structural.blockId);
				break;
			case "block-moved":
			case "block-converted":
			case "block-props-changed":
			case "table-changed":
			case "apps-changed":
			case "metadata-changed":
				break;
			case "block-split": {
				const text = next.get(structural.blockId) ?? "";
				next.set(structural.blockId, text.slice(0, structural.offset));
				next.set(structural.newBlockId, text.slice(structural.offset));
				break;
			}
			case "blocks-merged": {
				next.set(
					structural.targetBlockId,
					(next.get(structural.targetBlockId) ?? "") +
						(next.get(structural.sourceBlockId) ?? ""),
				);
				next.delete(structural.sourceBlockId);
				break;
			}
			default: {
				const _exhaustive: never = structural;
				return _exhaustive;
			}
		}
	}
	for (const splice of change.spliced) {
		const text = next.get(splice.blockId) ?? "";
		next.set(
			splice.blockId,
			text.slice(0, splice.from) + splice.insert + text.slice(splice.to),
		);
	}
	return next;
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

function label(op: number, point: Point, extra = ""): string {
	return `seed=${SEED} (${SEED_INFO.raw}) op=${op} ${point.blockId}:${point.offset}${extra}`;
}

describe("change summary properties", () => {
	it("I2: every valid pre-commit point maps to a valid post-commit point or null", { timeout: 60_000 }, () => {
		const rng = new Rng(SEED);
		let snapshot = initialSnapshot();
		let texts = initialTexts();
		let mapped = 0;
		let carets = 0;

		for (let i = 1; i <= OP_COUNT; i++) {
			if (Number.isFinite(FORCE_FAIL_AT) && i === FORCE_FAIL_AT) {
				throw new Error(
					`forced fuzz failure at op ${i} seed=${SEED} raw=${SEED_INFO.raw}`,
				);
			}
			const change = randomSummary(rng, snapshot, i);
			const summary = change.summary;
			const post = applySummaryToSnapshot(snapshot, summary);
			texts = applyGeneratedToTexts(texts, change);
			for (const id of livingIds(post)) {
				expect(
					(texts.get(id) ?? "").length,
					`utf16 seed=${SEED} op=${i} ${id}`,
				).toBe(post.lengthById.get(id) ?? 0);
			}

			const points = prePoints(snapshot);
			for (const point of points) {
				for (const assoc of I2_ASSOCS) {
					const clamp = summary.mapPoint(point, assoc, "clamp");
					expect(
						clamp,
						`I2 clamp ${label(i, point, ` assoc=${assoc}`)}`,
					).not.toBeNull();
					if (clamp) {
						expect(
							isValidPost(clamp, post),
							`I2 ${label(i, point, ` assoc=${assoc}`)} → ${clamp.blockId}:${clamp.offset}`,
						).toBe(true);
					}

					for (const mode of MODES) {
						if (mode === "clamp") continue;
						const tracked = summary.mapPoint(point, assoc, mode);
						if (tracked) expect(isValidPost(tracked, post)).toBe(true);
					}
				}

				const caret = { anchor: point, focus: point };
				const mappedCaret = summary.mapRange(caret);
				expect(
					mappedCaret,
					`A5 clamp caret ${label(i, point)}`,
				).not.toBeNull();
				if (mappedCaret) {
					expect(
						mappedCaret.anchor,
						`A5 collapsed ${label(i, point)}`,
					).toEqual(mappedCaret.focus);
					expect(
						isValidPost(mappedCaret.anchor, post),
						`A5 ${label(i, point)} → ${mappedCaret.anchor.blockId}:${mappedCaret.anchor.offset}`,
					).toBe(true);
				}
				carets += 1;
				mapped += 1;
			}

			if (NIGHTLY && points.length >= 2) {
				const anchor = rng.pick(points);
				const focus = rng.pick(points);
				const mappedRange = summary.mapRange({ anchor, focus });
				if (mappedRange) {
					expect(isValidPost(mappedRange.anchor, post)).toBe(true);
					expect(isValidPost(mappedRange.focus, post)).toBe(true);
				}
			}

			snapshot = post;
			if (livingIds(snapshot).length === 0) {
				snapshot = initialSnapshot();
				texts = initialTexts();
			}
		}

		expect(mapped).toBeGreaterThan(0);
		expect(carets).toBeGreaterThan(0);
	});

	it("I3: compose-then-map equals map-then-map", { timeout: 60_000 }, () => {
		const rng = new Rng(SEED + 1);
		let snapshot = initialSnapshot();
		let compared = 0;

		for (let i = 1; i <= OP_COUNT; i += 2) {
			const first = randomSummary(rng, snapshot, i).summary;
			const midSnap = applySummaryToSnapshot(snapshot, first);
			const second = randomSummary(rng, midSnap, i + 1).summary;
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
						expect(
							once,
							`I3 ${label(i, point, ` assoc=${assoc} mode=${mode}`)}`,
						).toEqual(through);
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

	it("initial RTL fixtures match declared UTF-16 lengths", () => {
		const snapshot = initialSnapshot();
		const texts = initialTexts();
		for (const [id, text] of texts) {
			expect(text.length, id).toBe(snapshot.lengthById.get(id));
		}
		expect(texts.get("a")).toMatch(/[\u0600-\u06FF]/);
		expect(texts.get("b")).toMatch(/[\u0590-\u05FF]/);
		expect(texts.get("c")).toMatch(/[\u0590-\u05FF]/);
		expect(texts.get("c")).toMatch(/\d/);
		expect([...texts.get("child")!].some((ch) => (ch.codePointAt(0) ?? 0) > 0xffff)).toBe(
			true,
		);
	});

	it("hyphenated nightly seeds hash instead of collapsing to 0", () => {
		expect(Number("99-1-1690000000")).toBeNaN();
		expect(parseFuzzSeed("99-1-1690000000").numeric).not.toBe(0);
		expect(parseFuzzSeed("99-1-1690000000").numeric).toBe(
			parseFuzzSeed("99-1-1690000000").numeric,
		);
		expect(parseFuzzSeed("99-1-1690000000").numeric).not.toBe(
			parseFuzzSeed("99-1-1690000001").numeric,
		);
		expect(parseFuzzSeed("42").numeric).toBe(42);
		expect(parseFuzzSeed(undefined).numeric).toBe(20260819);
	});

	it("generator can emit RTL, mixed direction, bidi marks, and multi-unit graphemes", () => {
		const rng = new Rng(SEED);
		let hebrew = false;
		let arabic = false;
		let mark = false;
		let isolate = false;
		let mixed = false;
		let multiUnit = false;
		let digitBesideRtl = false;
		for (let i = 0; i < 400; i++) {
			const text = randomInsert(rng);
			if (/[\u0590-\u05FF]/.test(text)) hebrew = true;
			if (/[\u0600-\u08FF]/.test(text)) arabic = true;
			if (/[\u200E\u200F]/.test(text)) mark = true;
			if (/[\u2066-\u2069]/.test(text)) isolate = true;
			if (
				/[\u0590-\u08FF]/.test(text) &&
				/[A-Za-z]/.test(text)
			) {
				mixed = true;
			}
			if (
				/[\u0590-\u08FF]\d|\d[\u0590-\u08FF]/.test(text)
			) {
				digitBesideRtl = true;
			}
			if (text.length !== [...text].length) multiUnit = true;
		}
		expect({ hebrew, arabic, mark, isolate, mixed, multiUnit, digitBesideRtl }).toEqual({
			hebrew: true,
			arabic: true,
			mark: true,
			isolate: true,
			mixed: true,
			multiUnit: true,
			digitBesideRtl: true,
		});
	});
});
