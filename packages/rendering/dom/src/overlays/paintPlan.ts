import type {
	OverlayAffinity,
	OverlayFlushCommit,
	OverlayGeometryReader,
	OverlayRect,
	OverlaySelectionRecord,
	OverlaySelectionState,
	PaintPlan,
	PaintPlanItem,
} from "./types";

const DEFAULT_AFFINITY: OverlayAffinity = "downstream";

/**
 * OV1 read-phase snapshot: plain data from `(commits, selection, reader)`.
 * Does not measure the DOM; the reader is the only geometry source.
 */
export function readPaintPlan(
	commits: readonly OverlayFlushCommit[],
	selection: OverlaySelectionRecord,
	reader: OverlayGeometryReader,
): PaintPlan {
	void commits;
	return {
		generation: reader.generation,
		items: itemsForSelection(selection.state, reader),
	};
}

function itemsForSelection(
	state: OverlaySelectionState,
	reader: OverlayGeometryReader,
): readonly PaintPlanItem[] {
	if (state == null) {
		return [];
	}

	switch (state.type) {
		case "text":
			return textItems(state, reader);
		case "block":
			return blockItems(state.blockIds, reader);
		default: {
			const _exhaustive: never = state;
			return _exhaustive;
		}
	}
}

function textItems(
	state: {
		readonly anchor: { readonly blockId: string; readonly offset: number };
		readonly focus: { readonly blockId: string; readonly offset: number };
		readonly affinity?: OverlayAffinity;
	},
	reader: OverlayGeometryReader,
): PaintPlanItem[] {
	const items: PaintPlanItem[] = [];
	const affinity = state.affinity ?? DEFAULT_AFFINITY;
	const caret = reader.caretRect(state.focus, affinity);
	if (caret) {
		items.push(item("caret:focus", "caret", caret));
	}

	const collapsed =
		state.anchor.blockId === state.focus.blockId &&
		state.anchor.offset === state.focus.offset;
	if (collapsed) {
		return items;
	}

	const rects = reader.rangeRects({
		anchor: state.anchor,
		focus: state.focus,
	});
	for (let index = 0; index < rects.length; index += 1) {
		const rect = rects[index];
		if (rect) {
			items.push(item(`range:${index}`, "range", rect));
		}
	}
	return items;
}

function blockItems(
	blockIds: readonly string[],
	reader: OverlayGeometryReader,
): PaintPlanItem[] {
	const items: PaintPlanItem[] = [];
	for (const blockId of blockIds) {
		const rect = reader.blockRect(blockId);
		if (rect) {
			items.push(item(`outline:block:${blockId}`, "outline", rect));
		}
	}
	return items;
}

function item(
	id: string,
	kind: PaintPlanItem["kind"],
	rect: OverlayRect,
): PaintPlanItem {
	return {
		id,
		kind,
		x: rect.x,
		y: rect.y,
		width: rect.width,
		height: rect.height,
	};
}
