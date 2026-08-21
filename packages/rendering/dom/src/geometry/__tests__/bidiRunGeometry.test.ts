import { describe, expect, it, vi } from "vitest";
import { computeBidiRuns } from "../../bidi";
import {
	attachBidiRunsToLines,
	rangeRectsFromLineBoxes,
	type LineBoxSeed,
} from "../bidiRunGeometry";
import type { BidiRun, Rect } from "../types";

const LATIN_ARABIC_LTR = "Hello مرحبا";
const ARABIC_LATIN_RTL = "مرحبا Hello";
const HEBREW_LATIN_LTR = "abאבcd";

function rect(
	left: number,
	top: number,
	width: number,
	height: number,
): Rect {
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
			(run) => measuredRuns.get(`${run.from}:${run.to}:${run.level}`) ?? null,
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

	it("G3: empty line keeps a degenerate paragraph-level box", () => {
		expect(
			attachBidiRunsToLines([seed(0, 0, rect(0, 0, 40, 16))], "", "ltr")[0]
				?.runs,
		).toEqual([
			{ run: { from: 0, to: 0, level: 0 }, rect: rect(0, 0, 40, 16) },
		]);
		expect(
			attachBidiRunsToLines([seed(0, 0, rect(0, 0, 40, 16))], "", "rtl")[0]
				?.runs,
		).toEqual([
			{ run: { from: 0, to: 0, level: 1 }, rect: rect(0, 0, 40, 16) },
		]);
	});

	it("G3: omitted text keeps the Wave 3 single-run seam", () => {
		const [line] = attachBidiRunsToLines([
			seed(0, 11, rect(0, 0, 80, 16)),
		]);
		expect(line?.runs).toEqual([
			{
				run: { from: 0, to: 11, level: 0 },
				rect: rect(0, 0, 80, 16),
			},
		]);
	});
});
