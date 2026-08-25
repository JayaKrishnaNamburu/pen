import type {
	Affinity,
	DocumentRange,
	PenDocument,
	Point,
	ReadonlySelectionState,
	TextSelection,
	CRDTArray,
} from "@input/pen-types";
import { DocumentRangeImpl } from "../editor/range";

type ReadonlyTextSelection = Extract<
	ReadonlySelectionState,
	{ type: "text" }
>;

/**
 * Live `TextSelection` constructor. Defaults `affinity` / `goalX`.
 * Predicates and the block span are helpers, not fields.
 */
export function createTextSelection(input: {
	readonly anchor: Point;
	readonly focus: Point;
	readonly affinity?: Affinity;
	readonly goalX?: number | null;
}): TextSelection {
	return {
		type: "text",
		anchor: { blockId: input.anchor.blockId, offset: input.anchor.offset },
		focus: { blockId: input.focus.blockId, offset: input.focus.offset },
		affinity: input.affinity ?? "downstream",
		goalX: input.goalX ?? null,
	};
}

export function isCollapsed(sel: ReadonlySelectionState): boolean {
	if (sel === null || sel.type !== "text") {
		return false;
	}
	return (
		sel.anchor.blockId === sel.focus.blockId &&
		sel.anchor.offset === sel.focus.offset
	);
}

export function isMultiBlock(sel: ReadonlySelectionState): boolean {
	if (sel === null || sel.type !== "text") {
		return false;
	}
	return sel.anchor.blockId !== sel.focus.blockId;
}

/**
 * Document-order block ids covered by `sel`. Pass a plain `blockOrder`
 * snapshot (`editor.documentState.blockOrder`) from a renderer effect —
 * walking a live `Y.Array` through a deep-proxied document writes back.
 */
export function getSelectionBlockRange(
	doc: PenDocument | readonly string[],
	sel: ReadonlySelectionState,
): string[] {
	if (sel === null) {
		return [];
	}
	switch (sel.type) {
		case "text":
			return isBlockOrderList(doc)
				? blockIdsFromOrder(doc, sel.anchor.blockId, sel.focus.blockId)
				: blockIdsBetween(doc, sel.anchor.blockId, sel.focus.blockId);
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
	sel: ReadonlyTextSelection,
): DocumentRange {
	return new DocumentRangeImpl(sel.anchor, sel.focus, doc);
}

function isBlockOrderList(
	value: PenDocument | readonly string[],
): value is readonly string[] {
	return Array.isArray(value);
}

function blockIdsFromOrder(
	order: readonly string[],
	anchorId: string,
	focusId: string,
): string[] {
	return sliceBlockIds(
		order.indexOf(anchorId),
		order.indexOf(focusId),
		anchorId,
		focusId,
		(index) => order[index] as string,
	);
}

function blockIdsBetween(
	doc: PenDocument,
	anchorId: string,
	focusId: string,
): string[] {
	const order = doc.blockOrder as CRDTArray<string>;
	return sliceBlockIds(
		indexOfBlock(order, anchorId),
		indexOfBlock(order, focusId),
		anchorId,
		focusId,
		(index) => order.get(index) as string,
	);
}

function sliceBlockIds(
	anchorIndex: number,
	focusIndex: number,
	anchorId: string,
	focusId: string,
	idAt: (index: number) => string,
): string[] {
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
		ids.push(idAt(i));
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
