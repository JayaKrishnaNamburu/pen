// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
	OVERLAY_ITEM_ATTR,
	OVERLAY_LAYER_ATTR,
	createOverlayLayer,
	type OverlayRect,
	type PaintPlan,
	type PaintPlanItem,
} from "..";

/**
 * Characterization of the overlay DOM for a decoration set that matches
 * the converted consumers: eight remote carets, one search-like range,
 * and one AI-review outline. This is the visual baseline the conversion
 * must keep: transforms only, pointer-events none, kinds and boxes
 * unchanged when the same plan is applied again.
 */
const CARETS: readonly OverlayRect[] = [
	{ x: 24, y: 24, width: 0, height: 18 },
	{ x: 35.5625, y: 24, width: 0, height: 18 },
	{ x: 44.390625, y: 24, width: 0, height: 18 },
	{ x: 48.125, y: 24, width: 0, height: 18 },
	{ x: 51.859375, y: 24, width: 0, height: 18 },
	{ x: 61, y: 24, width: 0, height: 18 },
	{ x: 65.1875, y: 24, width: 0, height: 18 },
	{ x: 76.953125, y: 24, width: 0, height: 18 },
];

const SEARCH_RANGE: OverlayRect = {
	x: 24,
	y: 24,
	width: 52.953125,
	height: 18,
};
const REVIEW_OUTLINE: OverlayRect = { x: 8, y: 16, width: 240, height: 32 };

function caretItem(index: number, rect: OverlayRect): PaintPlanItem {
	return {
		id: `remote-caret:${index}`,
		kind: "caret",
		...rect,
	};
}

function decorationSetPlan(generation: number): PaintPlan {
	return {
		generation,
		items: [
			...CARETS.map((rect, index) => caretItem(index, rect)),
			{ id: "range:search:0", kind: "range", ...SEARCH_RANGE },
			{ id: "outline:block:hello-p1", kind: "outline", ...REVIEW_OUTLINE },
		],
	};
}

function snapshotOverlay(layer: HTMLElement): {
	layer: {
		attr: string | null;
		ariaHidden: string | null;
		pointerEvents: string;
		itemCount: number;
	};
	items: Array<{
		kind: string | null;
		transform: string;
		left: string;
		top: string;
		width: string;
		height: string;
		pointerEvents: string;
	}>;
} {
	return {
		layer: {
			attr: layer.getAttribute(OVERLAY_LAYER_ATTR),
			ariaHidden: layer.getAttribute("aria-hidden"),
			pointerEvents: layer.style.pointerEvents,
			itemCount: layer.childElementCount,
		},
		items: [...layer.children].map((node) => {
			const item = node as HTMLElement;
			return {
				kind: item.getAttribute(OVERLAY_ITEM_ATTR),
				transform: item.style.transform,
				left: item.style.left,
				top: item.style.top,
				width: item.style.width,
				height: item.style.height,
				pointerEvents: item.style.pointerEvents,
			};
		}),
	};
}

function expectedItems(plan: PaintPlan) {
	return plan.items.map((item) => ({
		kind: item.kind,
		transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
		left: "0px",
		top: "0px",
		width: `${item.width}px`,
		height: `${item.height}px`,
		pointerEvents: "none",
	}));
}

describe("overlay visual contract", () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it("OV2: a multiplayer/search/AI decoration set paints transforms only and is idempotent", () => {
		const root = document.createElement("div");
		document.body.append(root);
		const layer = createOverlayLayer({ root });
		root.append(layer.element);

		const first = decorationSetPlan(3);
		layer.applyPaintPlan(first);
		const afterFirst = snapshotOverlay(layer.element);

		expect(afterFirst.layer).toEqual({
			attr: "",
			ariaHidden: "true",
			pointerEvents: "none",
			itemCount: 10,
		});
		expect(afterFirst.items).toEqual(expectedItems(first));
		expect(
			afterFirst.items.filter((item) => item.kind === "caret"),
		).toHaveLength(8);
		expect(afterFirst.items.map((item) => item.kind)).toEqual([
			"caret",
			"caret",
			"caret",
			"caret",
			"caret",
			"caret",
			"caret",
			"caret",
			"range",
			"outline",
		]);

		layer.applyPaintPlan(decorationSetPlan(4));
		expect(snapshotOverlay(layer.element)).toEqual(afterFirst);
	});

	it("OV2: a one-pixel caret shift changes the painted transform", () => {
		const root = document.createElement("div");
		document.body.append(root);
		const layer = createOverlayLayer({ root });
		root.append(layer.element);

		const first = decorationSetPlan(3);
		layer.applyPaintPlan(first);
		const afterFirst = snapshotOverlay(layer.element);
		const firstCaret = afterFirst.items[0];
		expect(firstCaret?.transform).toBe(
			`translate3d(${CARETS[0]!.x}px, ${CARETS[0]!.y}px, 0)`,
		);

		const shifted = {
			generation: 4,
			items: first.items.map((item, index) =>
				index === 0 ? { ...item, x: item.x + 1 } : item,
			),
		};
		layer.applyPaintPlan(shifted);
		const afterShift = snapshotOverlay(layer.element);
		expect(afterShift).not.toEqual(afterFirst);
		expect(afterShift.items[0]?.transform).toBe(
			`translate3d(${CARETS[0]!.x + 1}px, ${CARETS[0]!.y}px, 0)`,
		);

		layer.applyPaintPlan(first);
		expect(snapshotOverlay(layer.element)).toEqual(afterFirst);
	});
});
