import { describe, expect, it, vi } from "vitest";
import { BIDI_ATOM_MARKER, computeBidiRuns } from "../../bidi";
import {
	attachBidiRunsToLines,
	caretRectAtBidiBoundary,
	rangeRectsFromLineBoxes,
	type LineBoxSeed,
} from "../bidiRunGeometry";
import type { BidiRun, LineBox, Rect } from "../types";

const LATIN_ARABIC_LTR = "Hello مرحبا";
const ARABIC_LATIN_RTL = "مرحبا Hello";
const HEBREW_LATIN_LTR = "abאבcd";

function rect(left: number, top: number, width: number, height: number): Rect {
	return {
		x: left,
		y: top,
		width,
		height,
		left,
		top,
		right: left + width,
		bottom: top + height,
	};
}

function seed(
	start: number,
	end: number,
	box: Rect = rect(0, 0, 100, 16),
): LineBoxSeed {
	return {
		top: box.top,
		bottom: box.bottom,
		start,
		end,
		rect: box,
	};
}

describe("G3 attachBidiRunsToLines", () => {
	it("G3: latin-arabic LTR keeps computeBidiRuns visual order and measures each run", () => {
		const measured = new Map<string, Rect>([
			["0:6:0", rect(0, 0, 44, 16)],
			["6:11:1", rect(44, 0, 34, 16)],
		]);
		const measureRun = vi.fn((run: BidiRun) => {
			return measured.get(`${run.from}:${run.to}:${run.level}`) ?? null;
		});

		const [line] = attachBidiRunsToLines(
			[seed(0, LATIN_ARABIC_LTR.length)],
			LATIN_ARABIC_LTR,
			"ltr",
			measureRun,
		);

		expect(line?.runs.map((geo) => geo.run)).toEqual(
			computeBidiRuns(LATIN_ARABIC_LTR, "ltr"),
		);
		expect(line?.runs.map((geo) => geo.rect)).toEqual([
			rect(0, 0, 44, 16),
			rect(44, 0, 34, 16),
		]);
		expect(measureRun).toHaveBeenCalledTimes(2);
	});

	it("G3: arabic-latin RTL keeps L2 visual order, not a single spanning box", () => {
		const [line] = attachBidiRunsToLines(
			[seed(0, ARABIC_LATIN_RTL.length)],
			ARABIC_LATIN_RTL,
			"rtl",
			(run) => rect(run.from * 10, 0, (run.to - run.from) * 10, 16),
		);

		expect(line?.runs.map((geo) => geo.run)).toEqual(
			computeBidiRuns(ARABIC_LATIN_RTL, "rtl"),
		);
		expect(line?.runs).toHaveLength(2);
		expect(line?.runs[0]?.run).toEqual({ from: 6, to: 11, level: 2 });
		expect(line?.runs[1]?.run).toEqual({ from: 0, to: 6, level: 1 });
	});

	it("G3: WebKit-inflated run boxes pack into disjoint visual spans", () => {
		const measuredRuns = new Map<string, Rect>([
			["0:2:0", rect(24, 0, 17, 20)],
			["2:4:1", rect(40, 0, 18, 20)],
			["4:6:0", rect(40, 0, 35, 20)],
		]);
		const measuredSlices = new Map<string, Rect>([
			["1:2", rect(31, 0, 10, 20)],
			["2:4", rect(40, 0, 18, 20)],
			["4:5", rect(40, 0, 26, 20)],
		]);

		const [line] = attachBidiRunsToLines(
			[seed(0, HEBREW_LATIN_LTR.length, rect(24, 0, 51, 20))],
			HEBREW_LATIN_LTR,
			"ltr",
			(run) =>
				measuredRuns.get(`${run.from}:${run.to}:${run.level}`) ?? null,
		);

		expect(line?.runs.map((geo) => geo.rect)).toEqual([
			rect(24, 0, 17, 20),
			rect(41, 0, 17, 20),
			rect(58, 0, 17, 20),
		]);

		const rangeRects = rangeRectsFromLineBoxes(
			[line!],
			1,
			5,
			(start, end) => measuredSlices.get(`${start}:${end}`) ?? null,
		);
		expect(rangeRects).toEqual([
			rect(31, 0, 10, 20),
			rect(41, 0, 17, 20),
			rect(58, 0, 8, 20),
		]);
		expect(rangeRects[0]!.right).toBe(rangeRects[1]!.left);
		expect(rangeRects[1]!.right).toBe(rangeRects[2]!.left);
	});

	it("G3: hebrew-latin clips paragraph runs to the line and to a cross-boundary range", () => {
		const [line] = attachBidiRunsToLines(
			[seed(1, 5)],
			HEBREW_LATIN_LTR,
			"ltr",
			(run) => rect(run.from * 8, 0, (run.to - run.from) * 8, 16),
		);

		expect(line?.runs.map((geo) => geo.run)).toEqual([
			{ from: 1, to: 2, level: 0 },
			{ from: 2, to: 4, level: 1 },
			{ from: 4, to: 5, level: 0 },
		]);

		const rangeRects = rangeRectsFromLineBoxes(
			[line!],
			1,
			5,
			(start, end) => rect(start * 8, 0, (end - start) * 8, 16),
		);
		expect(rangeRects).toHaveLength(3);
	});

	it("G3: missing measureRun still emits disjoint per-run boxes, not the line union", () => {
		const [line] = attachBidiRunsToLines(
			[seed(0, LATIN_ARABIC_LTR.length, rect(10, 2, 110, 16))],
			LATIN_ARABIC_LTR,
			"ltr",
		);

		expect(line?.runs).toHaveLength(2);
		// each run is a strict sub-span of the 10..120 line, not the whole box
		expect(line?.runs[0]?.rect.right).toBeLessThan(120);
		expect(line?.runs[1]?.rect.left).toBeGreaterThan(10);
		expect(line?.runs[0]?.rect.right).toBe(line?.runs[1]?.rect.left);
		expect(line?.runs[0]?.rect.left).toBe(10);
		expect(line?.runs[1]?.rect.right).toBe(120);
	});

	it("G3: atom marker inside RTL is its own run, not the surrounding box", () => {
		const text = `مر${BIDI_ATOM_MARKER}حبا`;
		const [line] = attachBidiRunsToLines(
			[seed(0, text.length, rect(0, 0, 60, 16))],
			text,
			"rtl",
			(run) => rect(run.from * 10, 0, (run.to - run.from) * 10, 16),
		);

		expect(line?.runs.map((geo) => geo.run)).toEqual(
			computeBidiRuns(text, "rtl"),
		);
		expect(line?.runs).toHaveLength(3);
		expect(line?.runs.some((geo) => geo.run.to - geo.run.from === 1)).toBe(
			true,
		);
	});

	it("G3: empty line keeps a degenerate paragraph-level box", () => {
		expect(
			attachBidiRunsToLines(
				[seed(0, 0, rect(0, 0, 40, 16))],
				"",
				"ltr",
			)[0]?.runs,
		).toEqual([
			{ run: { from: 0, to: 0, level: 0 }, rect: rect(0, 0, 40, 16) },
		]);
		expect(
			attachBidiRunsToLines(
				[seed(0, 0, rect(0, 0, 40, 16))],
				"",
				"rtl",
			)[0]?.runs,
		).toEqual([
			{ run: { from: 0, to: 0, level: 1 }, rect: rect(0, 0, 40, 16) },
		]);
	});

	it("G3: omitted text keeps the single-run seam", () => {
		const [line] = attachBidiRunsToLines([seed(0, 11, rect(0, 0, 80, 16))]);
		expect(line?.runs).toEqual([
			{
				run: { from: 0, to: 11, level: 0 },
				rect: rect(0, 0, 80, 16),
			},
		]);
	});
});

describe("G3 caretRectAtBidiBoundary", () => {
	it("G3: downstream scans forward and upstream scans backward at a Latin→Arabic boundary", () => {
		const [line] = attachBidiRunsToLines(
			[seed(0, LATIN_ARABIC_LTR.length, rect(0, 0, 78, 16))],
			LATIN_ARABIC_LTR,
			"ltr",
			(run) =>
				run.level === 0 ? rect(0, 0, 44, 16) : rect(44, 0, 34, 16),
		);
		expect(line).toBeTruthy();
		const lines = [line!];

		expect(caretRectAtBidiBoundary(lines, 6, "downstream")).toEqual(
			rect(78, 0, 0, 16),
		);
		expect(caretRectAtBidiBoundary(lines, 6, "upstream")).toEqual(
			rect(44, 0, 0, 16),
		);
	});

	it("G3: the same affinity rule applies at both sides of a Hebrew embed", () => {
		const [line] = attachBidiRunsToLines(
			[seed(0, HEBREW_LATIN_LTR.length, rect(0, 0, 51, 16))],
			HEBREW_LATIN_LTR,
			"ltr",
			(run) => {
				if (run.from === 0) return rect(0, 0, 17, 16);
				if (run.from === 2) return rect(17, 0, 17, 16);
				return rect(34, 0, 17, 16);
			},
		);
		expect(line).toBeTruthy();
		const lines = [line!];

		expect(caretRectAtBidiBoundary(lines, 2, "downstream")).toEqual(
			rect(34, 0, 0, 16),
		);
		expect(caretRectAtBidiBoundary(lines, 2, "upstream")).toEqual(
			rect(17, 0, 0, 16),
		);
		expect(caretRectAtBidiBoundary(lines, 4, "downstream")).toEqual(
			rect(34, 0, 0, 16),
		);
		expect(caretRectAtBidiBoundary(lines, 4, "upstream")).toEqual(
			rect(17, 0, 0, 16),
		);
	});

	it("G3: a mid-run offset is not a boundary and returns null", () => {
		const [line] = attachBidiRunsToLines(
			[seed(0, LATIN_ARABIC_LTR.length)],
			LATIN_ARABIC_LTR,
			"ltr",
		);
		expect(caretRectAtBidiBoundary([line!], 3, "downstream")).toBeNull();
		expect(caretRectAtBidiBoundary([line!], 3, "upstream")).toBeNull();
	});
});

describe("G3 run-geometry fuzz", () => {
	// Length-arithmetic nightly (changeSummaries.properties.test.ts) covers
	// UTF-16 lengths under RTL input. This suite is the run-geometry half:
	// packing, range slicing, and the §3 affinity rule. It is not a native
	// Range.getClientRects comparison — that lives in g3-bidi-range-rects.
	// Do not name this *.properties.test.ts: vitest.nightly.ts pins include.

	const HEBREW = ["א", "ב", "ג", "ד", "ש", "ל"];
	const ARABIC = ["م", "ر", "ح", "ب", "ا"];
	const LATIN = ["a", "b", "c", "d", "e", " "];
	const DIGITS = ["1", "2", "3"];
	const MARKS = ["\u200E", "\u200F"];
	const ISOLATES = ["\u2066", "\u2067", "\u2068", "\u2069"];
	const ALPHABET = [
		...HEBREW,
		...ARABIC,
		...LATIN,
		...DIGITS,
		...MARKS,
		...ISOLATES,
		BIDI_ATOM_MARKER,
	];

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
			return max <= 0 ? 0 : Math.floor(this.next() * max);
		}
		pick<T>(items: readonly T[]): T {
			return items[this.int(items.length)]!;
		}
	}

	function overlaps(left: Rect, right: Rect): boolean {
		const width =
			Math.min(left.right, right.right) - Math.max(left.left, right.left);
		const height =
			Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
		return width > 0 && height > 0;
	}

	function generate(rng: Rng): { text: string; base: "ltr" | "rtl" } {
		const length = 4 + rng.int(10);
		let text = "";
		for (let i = 0; i < length; i += 1) {
			text += rng.pick(ALPHABET);
		}
		return { text, base: rng.next() < 0.5 ? "ltr" : "rtl" };
	}

	function measuredLine(
		text: string,
		base: "ltr" | "rtl",
		overlapPx: number,
	): LineBox {
		const runs = computeBidiRuns(text, base);
		let left = 0;
		const [line] = attachBidiRunsToLines(
			[
				seed(
					0,
					text.length,
					rect(0, 0, Math.max(text.length, 1) * 10, 16),
				),
			],
			text,
			base,
			(run) => {
				const width = Math.max(1, run.to - run.from) * 10;
				const box = rect(left, 0, width + overlapPx, 16);
				left += width;
				return box;
			},
		);
		expect(
			line,
			`expected a line for ${JSON.stringify(text)}`,
		).toBeTruthy();
		expect(line!.runs.map((geo) => geo.run)).toEqual(runs);
		return line!;
	}

	it("G3: 200 mixed-script strings pack disjoint runs and keep the affinity rule", () => {
		const rng = new Rng(20260821);
		let sawHebrew = false;
		let sawArabic = false;
		let sawLatin = false;
		let sawDigit = false;
		let sawAtom = false;
		let sawIsolate = false;

		for (let i = 0; i < 200; i += 1) {
			const { text, base } = generate(rng);
			sawHebrew ||= /[\u0590-\u05FF]/.test(text);
			sawArabic ||= /[\u0600-\u06FF]/.test(text);
			sawLatin ||= /[A-Za-z]/.test(text);
			sawDigit ||= /\d/.test(text);
			sawAtom ||= text.includes(BIDI_ATOM_MARKER);
			sawIsolate ||= /[\u2066-\u2069]/.test(text);
			if (text.length === 0) {
				continue;
			}

			const line = measuredLine(text, base, i % 3 === 0 ? 2 : 0);
			for (let a = 0; a < line.runs.length; a += 1) {
				for (let b = a + 1; b < line.runs.length; b += 1) {
					expect(
						overlaps(line.runs[a]!.rect, line.runs[b]!.rect),
						`overlap ${JSON.stringify(text)} ${a}/${b}`,
					).toBe(false);
				}
			}

			const from = rng.int(text.length);
			const to = Math.min(text.length, from + 1 + rng.int(4));
			const slices = rangeRectsFromLineBoxes([line], from, to);
			expect(slices.length).toBeGreaterThan(0);
			for (const slice of slices) {
				expect(slice.width).toBeGreaterThanOrEqual(0);
			}

			for (const geo of line.runs) {
				const down = caretRectAtBidiBoundary(
					[line],
					geo.run.from,
					"downstream",
				);
				const up = caretRectAtBidiBoundary(
					[line],
					geo.run.from,
					"upstream",
				);
				expect(
					down,
					`downstream at ${geo.run.from} in ${JSON.stringify(text)}`,
				).not.toBeNull();
				expect(
					up,
					`upstream at ${geo.run.from} in ${JSON.stringify(text)}`,
				).not.toBeNull();
				expect(down!.width).toBe(0);
				expect(up!.width).toBe(0);
			}
		}

		expect(sawHebrew).toBe(true);
		expect(sawArabic).toBe(true);
		expect(sawLatin).toBe(true);
		expect(sawDigit).toBe(true);
		expect(sawAtom).toBe(true);
		expect(sawIsolate).toBe(true);
	});
});
