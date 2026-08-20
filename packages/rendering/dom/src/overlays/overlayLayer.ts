import { readPaintPlan } from "./paintPlan";
import {
	OVERLAY_ITEM_ATTR,
	OVERLAY_LAYER_ATTR,
	type OverlayLayer,
	type OverlayLayerOptions,
	type PaintPlan,
	type PaintPlanItem,
} from "./types";

/**
 * Standalone Wave 3.3 overlay layer. Hosts append `element` as a sibling of
 * content; this module does not place it and does not subscribe to flushes.
 */
export function createOverlayLayer(options: OverlayLayerOptions): OverlayLayer {
	const element = options.root.ownerDocument.createElement("div");
	element.setAttribute(OVERLAY_LAYER_ATTR, "");
	// AX7 overlay — presentation layer; pointer-events none
	element.setAttribute("aria-hidden", "true");
	element.style.pointerEvents = "none";
	element.style.position = "absolute";
	element.style.left = "0px";
	element.style.top = "0px";
	element.style.right = "0px";
	element.style.bottom = "0px";

	const painted = new Map<string, HTMLElement>();
	const listeners = new Set<(plan: PaintPlan) => void>();

	const layer: OverlayLayer = {
		element,
		readPaintPlan: readPaintPlan,
		applyPaintPlan(plan) {
			applyPaintPlanToElement(element, painted, plan);
			for (const listener of [...listeners]) {
				listener(plan);
			}
		},
		onPaintPlan(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
	return layer;
}

export function applyPaintPlan(layer: OverlayLayer, plan: PaintPlan): void {
	layer.applyPaintPlan(plan);
}

export function onPaintPlan(
	layer: OverlayLayer,
	listener: (plan: PaintPlan) => void,
): () => void {
	return layer.onPaintPlan(listener);
}

function applyPaintPlanToElement(
	layer: HTMLElement,
	painted: Map<string, HTMLElement>,
	plan: PaintPlan,
): void {
	const keep = new Set<string>();
	const doc = layer.ownerDocument;

	for (const item of plan.items) {
		keep.add(item.id);
		let node = painted.get(item.id);
		if (!node) {
			node = doc.createElement("div");
			painted.set(item.id, node);
			layer.append(node);
		}
		paintItem(node, item);
	}

	for (const [id, node] of painted) {
		if (!keep.has(id)) {
			node.remove();
			painted.delete(id);
		}
	}
}

function paintItem(node: HTMLElement, item: PaintPlanItem): void {
	node.setAttribute(OVERLAY_ITEM_ATTR, item.kind);
	node.style.position = "absolute";
	node.style.left = "0px";
	node.style.top = "0px";
	node.style.width = `${item.width}px`;
	node.style.height = `${item.height}px`;
	node.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
	node.style.pointerEvents = "none";
}
