import type {
	Affinity,
	DocumentRange,
	PenDocument,
	Point,
	SelectionState,
	TextSelection,
	CRDTArray,
} from "@input/pen-types";
import { DocumentRangeImpl } from "../editor/range";

/**
 * Stamp factory for live `TextSelection` values.
 *
 * Recomputes `isCollapsed` / `isMultiBlock` / `blockRange` / `toRange`
 * from `(doc, sel)`. Never reads those fields off the incoming value
 * and never trusts a caller-supplied `blockRange` — command payloads
 * historically stamp `blockRange: [anchor.blockId]` even for multi-block
 * ranges.
 */
export function isCollapsed(sel: SelectionState): boolean {
	if (sel === null || sel.type !== "text") {
		return false;
	}
	return (
		sel.anchor.blockId === sel.focus.blockId &&
		sel.anchor.offset === sel.focus.offset
	);
}

export function isMultiBlock(sel: SelectionState): boolean {
	if (sel === null || sel.type !== "text") {
		return false;
	}
	return sel.anchor.blockId !== sel.focus.blockId;
}

export function getSelectionBlockRange(
	doc: PenDocument,
	sel: SelectionState,
): string[] {
	if (sel === null) {
		return [];
	}
	switch (sel.type) {
		case "text":
			return blockIdsBetween(doc, sel.anchor.blockId, sel.focus.blockId);
		case "block":
			return [...sel.blockIds];
		case "cell":
			return [sel.blockId];
		case "app":
			return [];
		default: {
			const _exhaustive: never = sel;
			return _exhaustive;
		}
	}
}

export function selectionToRange(
	doc: PenDocument,
	sel: TextSelection,
): DocumentRange {
	return new DocumentRangeImpl(sel.anchor, sel.focus, doc);
}

export function stampTextSelection(
	doc: PenDocument,
	input: {
		readonly anchor: Point;
		readonly focus: Point;
		readonly affinity?: Affinity;
		readonly goalX?: number | null;
	},
): TextSelection {
	const selection: TextSelection = {
		type: "text",
		anchor: { blockId: input.anchor.blockId, offset: input.anchor.offset },
		focus: { blockId: input.focus.blockId, offset: input.focus.offset },
		affinity: input.affinity ?? "downstream",
		goalX: input.goalX ?? null,
		isCollapsed: false,
		isMultiBlock: false,
		blockRange: [],
		toRange: () => selectionToRange(doc, selection),
	};
	return Object.assign(selection, {
		isCollapsed: isCollapsed(selection),
		isMultiBlock: isMultiBlock(selection),
		blockRange: getSelectionBlockRange(doc, selection),
		toRange: () => selectionToRange(doc, selection),
	});
}

function blockIdsBetween(
	doc: PenDocument,
	anchorId: string,
	focusId: string,
): string[] {
	const order = doc.blockOrder as CRDTArray<string>;
	const anchorIndex = indexOfBlock(order, anchorId);
	const focusIndex = indexOfBlock(order, focusId);
	if (anchorIndex < 0 && focusIndex < 0) {
		return [];
	}
	if (anchorIndex < 0) {
		return [focusId];
	}
	if (focusIndex < 0) {
		return [anchorId];
	}
	const from = Math.min(anchorIndex, focusIndex);
	const to = Math.max(anchorIndex, focusIndex);
	const ids: string[] = [];
	for (let i = from; i <= to; i++) {
		ids.push(order.get(i) as string);
	}
	return ids;
}

function indexOfBlock(order: CRDTArray<string>, blockId: string): number {
	for (let i = 0; i < order.length; i++) {
		if ((order.get(i) as string) === blockId) {
			return i;
		}
	}
	return -1;
}
