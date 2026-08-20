import { computeBidiRuns, type BlockDirection } from "../bidi";
import type {
	Affinity,
	BidiRun,
	BidiRunGeometry,
	LineBox,
	Rect,
} from "./types";
import { collapsedRect, isUsefulRect } from "./types";

export type LineBoxSeed = {
	readonly top: number;
	readonly bottom: number;
	readonly start: number;
	readonly end: number;
	readonly rect: Rect;
};

/**
 * Length-proportional left-to-right slices of the line box.
 * jsdom `Range.getClientRects` is empty, so this is the unit-test
 * approximation. Browser 1px agreement with native selection rects is
 * deferred to the conformance harness (wave 6.3 checkpoint).
 */
export function splitLineRectByRunLength(
	runs: readonly BidiRun[],
	lineRect: Rect,
): BidiRunGeometry[] {
	const total = runs.reduce((sum, run) => sum + (run.to - run.from), 0);
	if (total <= 0) {
		return runs.map((run) => ({ run, rect: lineRect }));
	}

	let x = lineRect.left;
	return runs.map((run, index) => {
		const last = index === runs.length - 1;
		const width = last
			? lineRect.right - x
			: (lineRect.width * (run.to - run.from)) / total;
		const rect: Rect = {
			x,
			y: lineRect.top,
			width,
			height: lineRect.height,
			left: x,
			top: lineRect.top,
			right: x + width,
			bottom: lineRect.bottom,
		};
		x += width;
		return { run, rect };
	});
}

export function clipRunsToLine(
	runs: readonly BidiRun[],
	startOffset: number,
	endOffset: number,
	base: BlockDirection,
): BidiRun[] {
	const clipped: BidiRun[] = [];
	for (const run of runs) {
		const from = Math.max(run.from, startOffset);
		const to = Math.min(run.to, endOffset);
		if (to > from) {
			clipped.push({ from, to, level: run.level });
		}
	}
	if (clipped.length === 0) {
		return [
			{
				from: startOffset,
				to: endOffset,
				level: base === "rtl" ? 1 : 0,
			},
		];
	}
	return clipped;
}

export function attachBidiRunsToLines(
	lines: readonly LineBoxSeed[],
	text: string,
	base: BlockDirection,
	measureRun?: (run: BidiRun) => Rect | null,
): LineBox[] {
	const allRuns = computeBidiRuns(text, base);
	return lines.map((line) => {
		const runs = clipRunsToLine(allRuns, line.start, line.end, base);
		return {
			top: line.top,
			bottom: line.bottom,
			startOffset: line.start,
			endOffset: line.end,
			runs: assignRunRects(runs, line.rect, measureRun),
		};
	});
}

export function rangeRectsFromLineBoxes(
	lines: readonly LineBox[],
	from: number,
	to: number,
	measureSlice?: (start: number, end: number) => Rect | null,
): Rect[] {
	const lo = Math.min(from, to);
	const hi = Math.max(from, to);
	if (lo === hi) {
		return [];
	}

	const slices: { start: number; end: number; approx: Rect }[] = [];
	for (const line of lines) {
		for (const geo of line.runs) {
			const start = Math.max(geo.run.from, lo);
			const end = Math.min(geo.run.to, hi);
			if (end <= start) {
				continue;
			}
			slices.push({
				start,
				end,
				approx: sliceRunRect(geo, start, end),
			});
		}
	}

	if (!measureSlice) {
		return slices.map((slice) => slice.approx);
	}

	const measured: Rect[] = [];
	for (const slice of slices) {
		const rect = measureSlice(slice.start, slice.end);
		if (!rect || !isUsefulRect(rect)) {
			return slices.map((entry) => entry.approx);
		}
		measured.push(rect);
	}
	return measured;
}

export function caretRectAtBidiBoundary(
	lines: readonly LineBox[],
	offset: number,
	affinity: Affinity,
): Rect | null {
	if (lines.length === 0) {
		return null;
	}

	const wrapIndex = findWrapIndex(lines, offset);
	if (wrapIndex >= 0) {
		const prev = lines[wrapIndex];
		const next = lines[wrapIndex + 1];
		if (!prev || !next) {
			return null;
		}
		switch (affinity) {
			case "downstream":
				return caretOnRun(runStartingAt(next, offset), "start");
			case "upstream":
				return caretOnRun(runEndingAt(prev, offset), "end");
			default: {
				const _exhaustive: never = affinity;
				return _exhaustive;
			}
		}
	}

	const line = lineContaining(lines, offset);
	if (!line || line.runs.length === 0) {
		return null;
	}
	if (!isRunBoundary(line.runs, offset)) {
		return null;
	}

	const geo = pickRunForAffinity(line.runs, offset, affinity);
	if (!geo) {
		return null;
	}
	return caretOnRun(geo, caretEdgeForPickedRun(line.runs, offset, affinity));
}

function assignRunRects(
	runs: readonly BidiRun[],
	lineRect: Rect,
	measureRun?: (run: BidiRun) => Rect | null,
): BidiRunGeometry[] {
	if (measureRun) {
		const measured: Rect[] = [];
		let allUseful = true;
		for (const run of runs) {
			const rect = measureRun(run);
			if (!rect || !isUsefulRect(rect)) {
				allUseful = false;
				break;
			}
			measured.push(rect);
		}
		if (allUseful && measured.length === runs.length) {
			return runs.map((run, index) => ({
				run,
				rect: measured[index]!,
			}));
		}
	}
	return splitLineRectByRunLength(runs, lineRect);
}

function sliceRunRect(
	geo: BidiRunGeometry,
	start: number,
	end: number,
): Rect {
	if (start === geo.run.from && end === geo.run.to) {
		return geo.rect;
	}
	const runLen = geo.run.to - geo.run.from;
	if (runLen <= 0) {
		return geo.rect;
	}
	const startRatio = (start - geo.run.from) / runLen;
	const endRatio = (end - geo.run.from) / runLen;
	const rtl = geo.run.level % 2 === 1;
	const leftRatio = rtl ? 1 - endRatio : startRatio;
	const rightRatio = rtl ? 1 - startRatio : endRatio;
	const left = geo.rect.left + geo.rect.width * leftRatio;
	const right = geo.rect.left + geo.rect.width * rightRatio;
	return {
		x: left,
		y: geo.rect.top,
		width: right - left,
		height: geo.rect.height,
		left,
		top: geo.rect.top,
		right,
		bottom: geo.rect.bottom,
	};
}

function findWrapIndex(lines: readonly LineBox[], offset: number): number {
	for (let index = 0; index < lines.length - 1; index += 1) {
		const prev = lines[index];
		const next = lines[index + 1];
		if (
			prev &&
			next &&
			offset === prev.endOffset &&
			offset === next.startOffset
		) {
			return index;
		}
	}
	return -1;
}

function lineContaining(
	lines: readonly LineBox[],
	offset: number,
): LineBox | null {
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (!line) {
			continue;
		}
		const last = index === lines.length - 1;
		if (
			offset >= line.startOffset &&
			(offset < line.endOffset || (last && offset <= line.endOffset))
		) {
			return line;
		}
	}
	return lines[0] ?? null;
}

function isRunBoundary(
	runs: readonly BidiRunGeometry[],
	offset: number,
): boolean {
	return runs.some(
		(geo) => geo.run.from === offset || geo.run.to === offset,
	);
}

function pickRunForAffinity(
	runs: readonly BidiRunGeometry[],
	offset: number,
	affinity: Affinity,
): BidiRunGeometry | null {
	const logical = [...runs].sort((left, right) => left.run.from - right.run.from);
	switch (affinity) {
		case "downstream": {
			for (const geo of logical) {
				if (offset >= geo.run.from && offset < geo.run.to) {
					return geo;
				}
			}
			return logical[logical.length - 1] ?? null;
		}
		case "upstream": {
			for (let index = logical.length - 1; index >= 0; index -= 1) {
				const geo = logical[index];
				if (geo && offset > geo.run.from && offset <= geo.run.to) {
					return geo;
				}
			}
			return logical[0] ?? null;
		}
		default: {
			const _exhaustive: never = affinity;
			return _exhaustive;
		}
	}
}

function caretEdgeForPickedRun(
	runs: readonly BidiRunGeometry[],
	offset: number,
	affinity: Affinity,
): "start" | "end" {
	const logical = [...runs].sort((left, right) => left.run.from - right.run.from);
	const first = logical[0];
	const last = logical[logical.length - 1];
	const atStart = Boolean(first && offset <= first.run.from);
	const atEnd = Boolean(last && offset >= last.run.to);
	switch (affinity) {
		case "downstream":
			return atEnd ? "end" : "start";
		case "upstream":
			return atStart ? "start" : "end";
		default: {
			const _exhaustive: never = affinity;
			return _exhaustive;
		}
	}
}

function runStartingAt(line: LineBox, offset: number): BidiRunGeometry | null {
	return (
		line.runs.find((geo) => geo.run.from === offset) ??
		[...line.runs].sort((left, right) => left.run.from - right.run.from)[0] ??
		null
	);
}

function runEndingAt(line: LineBox, offset: number): BidiRunGeometry | null {
	const logical = [...line.runs].sort(
		(left, right) => left.run.from - right.run.from,
	);
	return (
		line.runs.find((geo) => geo.run.to === offset) ??
		logical[logical.length - 1] ??
		null
	);
}

function caretOnRun(
	geo: BidiRunGeometry | null,
	edge: "start" | "end",
): Rect | null {
	if (!geo) {
		return null;
	}
	const rtl = geo.run.level % 2 === 1;
	const startX = rtl ? geo.rect.right : geo.rect.left;
	const endX = rtl ? geo.rect.left : geo.rect.right;
	const x = edge === "start" ? startX : endX;
	return collapsedRect(x, geo.rect.top, geo.rect.height);
}
