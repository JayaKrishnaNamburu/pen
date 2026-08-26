// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import {
	createGeometryReader,
	type GeometryReaderHost,
	type LineBox,
	type Rect,
} from "../index";
import { collapsedRect, singleRunLineBox } from "../types";

const readers: GeometryReaderHost[] = [];

afterEach(() => {
	for (const reader of readers) {
		reader.dispose();
	}
	readers.length = 0;
	document.body.replaceChildren();
});

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
): void {
	const block = document.createElement("div");
	block.setAttribute(DATA_ATTRS.editorBlock, "");
	block.setAttribute(DATA_ATTRS.blockId, blockId);
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

describe("GeometryReader LineBox.runs", () => {
	it("G3: LineBox.runs is the computeBidiRuns visual-order split, cached until commit", () => {
		const text = "hello مرحبا world";
		const root = mountEditorRoot();
		mountBlock(root, "p1", text, mockDOMRect(0, 0, 170, 16));
		const reader = createReader(root, { commitId: 1 });

		const first = reader.lineBoxes("p1");
		expect(first[0]?.runs.map((geo) => geo.run)).toEqual([
			{ from: 0, to: 6, level: 0 },
			{ from: 6, to: 11, level: 1 },
			{ from: 11, to: text.length, level: 0 },
		]);
		expect(reader.lineBoxes("p1")).toBe(first);

		const generation = reader.generation;
		reader.setBlockCommitId("p1", 2);
		expect(reader.generation).toBeGreaterThan(generation);
		expect(reader.lineBoxes("p1")).not.toBe(first);
		expect(reader.lineBoxes("p1")[0]?.runs).toHaveLength(3);
	});

	it("G3: caretRect at a line wrap uses affinity on adjacent single-run boxes", () => {
		const root = mountEditorRoot();
		mountBlock(root, "p1", "abcdefghij", mockDOMRect(0, 0, 100, 32));
		const lines: readonly LineBox[] = [
			singleRunLineBox(rect(0, 0, 100, 16), 0, 10),
			singleRunLineBox(rect(0, 16, 100, 16), 10, 20),
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

	it("G3: empty line keeps a degenerate single-run box", () => {
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
