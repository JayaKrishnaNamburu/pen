// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { computeBidiRuns } from "../../bidi";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import {
	createGeometryReader,
	type GeometryReaderHost,
	type LineBox,
	type Rect,
} from "../index";
import { collapsedRect } from "../types";

const readers: GeometryReaderHost[] = [];

afterEach(() => {
	for (const reader of readers) {
		reader.dispose();
	}
	readers.length = 0;
	document.body.replaceChildren();
});

const ARABIC = "مرحبا";
const MIXED = `hello ${ARABIC} world`;

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

function mockDOMRect(
	left: number,
	top: number,
	width: number,
	height: number,
): DOMRect {
	return {
		x: left,
		y: top,
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		toJSON() {
			return {};
		},
	} as DOMRect;
}

function mountEditorRoot(): HTMLElement {
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorContent, "");
	document.body.appendChild(root);
	return root;
}

function mountBlock(
	root: HTMLElement,
	blockId: string,
	text: string,
	blockRect: DOMRect,
	dir?: "ltr" | "rtl",
): void {
	const block = document.createElement("div");
	block.setAttribute(DATA_ATTRS.editorBlock, "");
	block.setAttribute(DATA_ATTRS.blockId, blockId);
	if (dir) {
		block.setAttribute("dir", dir);
	}
	const inline = document.createElement("div");
	inline.setAttribute(DATA_ATTRS.inlineContent, "");
	inline.appendChild(document.createTextNode(text));
	block.appendChild(inline);
	root.appendChild(block);
	block.getBoundingClientRect = () => blockRect;
	inline.getBoundingClientRect = () => blockRect;
}

function createReader(
	root: HTMLElement,
	options: Omit<Parameters<typeof createGeometryReader>[0], "root"> = {},
): GeometryReaderHost {
	const reader = createGeometryReader({
		root,
		observeResize: false,
		observeFonts: false,
		...options,
	});
	readers.push(reader);
	return reader;
}

describe("GeometryReader BR3", () => {
	it("BR3: LineBox.runs come from computeBidiRuns and stay on the G2 per-block cache", () => {
		const root = mountEditorRoot();
		mountBlock(root, "p1", MIXED, mockDOMRect(0, 0, 170, 16));
		const reader = createReader(root, { commitId: 1 });

		const first = reader.lineBoxes("p1");
		expect(first).toHaveLength(1);
		expect(first[0]?.runs.map((geo) => geo.run)).toEqual(
			computeBidiRuns(MIXED, "ltr"),
		);
		expect(reader.lineBoxes("p1")).toBe(first);
		expect(reader.lineBoxes("p1")[0]?.runs).toBe(first[0]?.runs);

		const generation = reader.generation;
		reader.setBlockCommitId("p1", 2);
		expect(reader.generation).toBeGreaterThan(generation);

		const afterCommit = reader.lineBoxes("p1");
		expect(afterCommit).not.toBe(first);
		expect(afterCommit[0]?.runs.map((geo) => geo.run)).toEqual(
			computeBidiRuns(MIXED, "ltr"),
		);
		expect(reader.lineBoxes("p1")).toBe(afterCommit);

		reader.bumpResizeGeneration();
		const afterResize = reader.lineBoxes("p1");
		expect(afterResize).not.toBe(afterCommit);

		reader.bumpFontGeneration();
		const afterFont = reader.lineBoxes("p1");
		expect(afterFont).not.toBe(afterResize);

		reader.invalidateBlocks(["p1"], 3);
		const afterInvalidate = reader.lineBoxes("p1");
		expect(afterInvalidate).not.toBe(afterFont);
		expect(afterInvalidate[0]?.runs.map((geo) => geo.run)).toEqual(
			computeBidiRuns(MIXED, "ltr"),
		);
	});

	it("BR3: dir=rtl on the block host is the computeBidiRuns base", () => {
		const root = mountEditorRoot();
		mountBlock(root, "p1", ARABIC, mockDOMRect(0, 0, 80, 16), "rtl");
		const reader = createReader(root);

		expect(reader.lineBoxes("p1")[0]?.runs.map((geo) => geo.run)).toEqual(
			computeBidiRuns(ARABIC, "rtl"),
		);
	});
});

describe("GeometryReader G3", () => {
	it("G3: mixed-direction lineBoxes split the line rect by run length when client rects are empty", () => {
		// jsdom cannot produce real per-run rects. Browser 1px agreement
		// with native selection rects is deferred to the conformance harness.
		const root = mountEditorRoot();
		const lineRect = mockDOMRect(10, 4, 170, 16);
		mountBlock(root, "p1", MIXED, lineRect);
		const reader = createReader(root);

		const box = reader.lineBoxes("p1")[0];
		const expectedRuns = computeBidiRuns(MIXED, "ltr");
		expect(box?.runs.map((geo) => geo.run)).toEqual(expectedRuns);
		expect(box?.runs.length).toBeGreaterThan(1);

		const total = MIXED.length;
		let x = 10;
		for (const [index, geo] of (box?.runs ?? []).entries()) {
			const last = index === (box?.runs.length ?? 0) - 1;
			const width = last
				? 180 - x
				: (170 * (geo.run.to - geo.run.from)) / total;
			expect(geo.rect.left).toBeCloseTo(x);
			expect(geo.rect.width).toBeCloseTo(width);
			expect(geo.rect.top).toBe(4);
			expect(geo.rect.height).toBe(16);
			x += width;
		}
	});

	it("G3: rangeRects of an RTL-embedded range inside an LTR line are disjoint per-run rects", () => {
		const root = mountEditorRoot();
		mountBlock(root, "p1", MIXED, mockDOMRect(0, 0, 170, 16));
		const reader = createReader(root);
		const box = reader.lineBoxes("p1")[0];
		expect(box).toBeTruthy();
		if (!box) {
			throw new Error("expected a line box");
		}

		const all = reader.rangeRects({
			anchor: { blockId: "p1", offset: 0 },
			focus: { blockId: "p1", offset: MIXED.length },
		});
		expect(all).toEqual(box.runs.map((geo) => geo.rect));
		expect(all.length).toBeGreaterThan(1);
		for (let index = 1; index < all.length; index += 1) {
			const prev = all[index - 1];
			const next = all[index];
			expect(prev && next && next.left >= prev.right - 0.01).toBe(true);
		}

		const rtlRun = box.runs.find((geo) => geo.run.level % 2 === 1);
		expect(rtlRun).toBeTruthy();
		if (!rtlRun) {
			throw new Error("expected an rtl run");
		}
		expect(
			reader.rangeRects({
				anchor: { blockId: "p1", offset: rtlRun.run.from },
				focus: { blockId: "p1", offset: rtlRun.run.to },
			}),
		).toEqual([rtlRun.rect]);
	});

	it("G3: caretRect at a bidi boundary follows the §3 affinity rule", () => {
		const root = mountEditorRoot();
		mountBlock(root, "p1", MIXED, mockDOMRect(0, 0, 170, 16));
		const reader = createReader(root);
		const box = reader.lineBoxes("p1")[0];
		expect(box).toBeTruthy();
		if (!box) {
			throw new Error("expected a line box");
		}
		const boundary = box.runs[0]?.run.to;
		expect(boundary).toBeGreaterThan(0);
		if (boundary === undefined) {
			throw new Error("expected a run boundary");
		}

		const downstream = reader.caretRect(
			{ blockId: "p1", offset: boundary },
			"downstream",
		);
		const upstream = reader.caretRect(
			{ blockId: "p1", offset: boundary },
			"upstream",
		);
		const nextRun = box.runs.find((geo) => geo.run.from === boundary);
		const prevRun = box.runs.find((geo) => geo.run.to === boundary);
		expect(nextRun).toBeTruthy();
		expect(prevRun).toBeTruthy();
		if (!nextRun || !prevRun) {
			throw new Error("expected runs on both sides of the boundary");
		}

		const nextStart =
			nextRun.run.level % 2 === 1 ? nextRun.rect.right : nextRun.rect.left;
		const prevEnd =
			prevRun.run.level % 2 === 1 ? prevRun.rect.left : prevRun.rect.right;
		expect(downstream).toEqual(collapsedRect(nextStart, 0, 16));
		expect(upstream).toEqual(collapsedRect(prevEnd, 0, 16));
		expect(downstream?.left).not.toBe(upstream?.left);
	});

	it("G3: caretRect at a line wrap uses the same affinity rule on adjacent line boxes", () => {
		const root = mountEditorRoot();
		mountBlock(root, "p1", "abcdefghij", mockDOMRect(0, 0, 100, 32));
		const lines: readonly LineBox[] = [
			{
				top: 0,
				bottom: 16,
				startOffset: 0,
				endOffset: 10,
				runs: [
					{
						run: { from: 0, to: 10, level: 0 },
						rect: rect(0, 0, 100, 16),
					},
				],
			},
			{
				top: 16,
				bottom: 32,
				startOffset: 10,
				endOffset: 20,
				runs: [
					{
						run: { from: 10, to: 20, level: 0 },
						rect: rect(0, 16, 100, 16),
					},
				],
			},
		];
		const reader = createReader(root, {
			measure: { lineBoxes: () => lines },
		});

		expect(
			reader.caretRect({ blockId: "p1", offset: 10 }, "downstream"),
		).toEqual(collapsedRect(0, 16, 16));
		expect(
			reader.caretRect({ blockId: "p1", offset: 10 }, "upstream"),
		).toEqual(collapsedRect(100, 0, 16));
	});

	it("G3: empty line keeps a degenerate paragraph-level run", () => {
		const root = mountEditorRoot();
		mountBlock(root, "p1", "", mockDOMRect(0, 0, 40, 16));
		const reader = createReader(root);
		expect(reader.lineBoxes("p1")[0]?.runs).toEqual([
			{
				run: { from: 0, to: 0, level: 0 },
				rect: rect(0, 0, 40, 16),
			},
		]);
	});
});
