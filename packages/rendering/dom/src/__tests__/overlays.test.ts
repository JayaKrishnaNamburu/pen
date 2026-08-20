// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	OVERLAY_ITEM_ATTR,
	OVERLAY_LAYER_ATTR,
	createOverlayLayer,
	readPaintPlan,
} from "../overlays";
import type {
	OverlayFlushCommit,
	OverlayGeometryReader,
	OverlayRect,
	OverlaySelectionRecord,
	PaintPlan,
} from "../overlays";

const commits: readonly OverlayFlushCommit[] = [{ commitId: 7 }];

const caretRect: OverlayRect = { x: 12, y: 24, width: 2, height: 16 };
const rangeRect: OverlayRect = { x: 12, y: 24, width: 40, height: 16 };
const blockRect: OverlayRect = { x: 0, y: 8, width: 120, height: 32 };

function createFakeReader(
	overrides: Partial<OverlayGeometryReader> = {},
): OverlayGeometryReader {
	return {
		generation: 3,
		caretRect: () => caretRect,
		rangeRects: () => [rangeRect],
		blockRect: () => blockRect,
		...overrides,
	};
}

function collapsedTextRecord(): OverlaySelectionRecord {
	return {
		state: {
			type: "text",
			anchor: { blockId: "p1", offset: 4 },
			focus: { blockId: "p1", offset: 4 },
			affinity: "downstream",
		},
		version: 1,
		commitId: 7,
	};
}

function rangeTextRecord(): OverlaySelectionRecord {
	return {
		state: {
			type: "text",
			anchor: { blockId: "p1", offset: 2 },
			focus: { blockId: "p1", offset: 8 },
		},
		version: 2,
		commitId: 7,
	};
}

describe("overlay contract", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 1),
		);
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("OV2: creates a pointer-events:none layer; sibling-of-content is a host concern", () => {
		const root = document.createElement("div");
		const content = document.createElement("div");
		content.setAttribute("data-pen-editor-content", "");
		root.append(content);
		document.body.append(root);

		const layer = createOverlayLayer({ root });

		expect(layer.element.getAttribute(OVERLAY_LAYER_ATTR)).toBe("");
		expect(layer.element.getAttribute("aria-hidden")).toBe("true");
		expect(layer.element.style.pointerEvents).toBe("none");
		expect(layer.element.parentNode).toBeNull();
		expect(content.nextSibling).toBeNull();
		expect(vi.mocked(requestAnimationFrame)).not.toHaveBeenCalled();

		root.append(layer.element);
		expect(content.nextSibling).toBe(layer.element);
	});

	it("OV1: read phase produces a plain PaintPlan; write phase paints with transforms", () => {
		const root = document.createElement("div");
		const layer = createOverlayLayer({ root });
		const reader = createFakeReader();

		const plan = layer.readPaintPlan(
			commits,
			collapsedTextRecord(),
			reader,
		);

		expect(plan).toEqual({
			generation: 3,
			items: [{ id: "caret:focus", kind: "caret", ...caretRect }],
		});
		expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
		expect(layer.element.childElementCount).toBe(0);

		layer.applyPaintPlan(plan);

		const item = layer.element.firstElementChild as HTMLElement;
		expect(item.getAttribute(OVERLAY_ITEM_ATTR)).toBe("caret");
		expect(item.style.transform).toBe("translate3d(12px, 24px, 0)");
		expect(item.style.left).toBe("0px");
		expect(item.style.top).toBe("0px");
		expect(item.style.width).toBe("2px");
		expect(item.style.height).toBe("16px");
		expect(item.style.pointerEvents).toBe("none");
	});

	it("OV1: range and block selections snapshot reader rects without measuring the DOM", () => {
		const reader = createFakeReader({
			caretRect: vi.fn(() => caretRect),
			rangeRects: vi.fn(() => [rangeRect]),
			blockRect: vi.fn((blockId: string) =>
				blockId === "h1" ? blockRect : null,
			),
		});

		const rangePlan = readPaintPlan(commits, rangeTextRecord(), reader);
		expect(rangePlan.items).toEqual([
			{ id: "caret:focus", kind: "caret", ...caretRect },
			{ id: "range:0", kind: "range", ...rangeRect },
		]);
		expect(reader.caretRect).toHaveBeenCalledWith(
			{ blockId: "p1", offset: 8 },
			"downstream",
		);
		expect(reader.rangeRects).toHaveBeenCalledWith({
			anchor: { blockId: "p1", offset: 2 },
			focus: { blockId: "p1", offset: 8 },
		});

		const blockPlan = readPaintPlan(
			commits,
			{ state: { type: "block", blockIds: ["h1", "missing"] } },
			reader,
		);
		expect(blockPlan.items).toEqual([
			{ id: "outline:block:h1", kind: "outline", ...blockRect },
		]);

		expect(readPaintPlan(commits, { state: null }, reader).items).toEqual(
			[],
		);
	});

	it("OV3: onPaintPlan delivers the applied plan to bindings", () => {
		const root = document.createElement("div");
		const layer = createOverlayLayer({ root });
		const seen: PaintPlan[] = [];
		const stop = layer.onPaintPlan((plan) => {
			seen.push(plan);
		});

		const plan = layer.readPaintPlan(
			commits,
			collapsedTextRecord(),
			createFakeReader(),
		);
		expect(seen).toEqual([]);

		layer.applyPaintPlan(plan);
		expect(seen).toEqual([plan]);

		stop();
		layer.applyPaintPlan(plan);
		expect(seen).toHaveLength(1);
	});

	it("OV1 OV2: applyPaintPlan reconciles items and keeps positioning on transforms", () => {
		const root = document.createElement("div");
		const layer = createOverlayLayer({ root });
		const first = readPaintPlan(
			commits,
			rangeTextRecord(),
			createFakeReader(),
		);
		layer.applyPaintPlan(first);
		expect(layer.element.childElementCount).toBe(2);

		const next: PaintPlan = {
			generation: 4,
			items: [
				{
					id: "caret:focus",
					kind: "caret",
					x: 30,
					y: 40,
					width: 2,
					height: 18,
				},
			],
		};
		layer.applyPaintPlan(next);

		expect(layer.element.childElementCount).toBe(1);
		const item = layer.element.firstElementChild as HTMLElement;
		expect(item.style.transform).toBe("translate3d(30px, 40px, 0)");
		expect(item.style.left).toBe("0px");
		expect(item.style.top).toBe("0px");
	});
});
