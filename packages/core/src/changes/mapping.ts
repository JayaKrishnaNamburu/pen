import {
	applySummaryToSnapshot,
	emptyBlockIndexSnapshot,
	type BlockIndexSnapshot,
} from "./blockIndex";
import { composeBlockText } from "./spliceCompose";
import { composeStructural } from "./structuralCompose";
import type {
	Assoc,
	BlockTextChange,
	ChangeSummary,
	Point,
	PointMapMode,
	StructuralChange,
	TextSplice,
} from "./types";

export const DEFAULT_ASSOC: Assoc = 1;
export const DEFAULT_POINT_MAP_MODE: PointMapMode = "clamp";
export const DEFAULT_RANGE_ANCHOR_ASSOC: Assoc = -1;
export const DEFAULT_RANGE_FOCUS_ASSOC: Assoc = 1;

export interface ChangeSummaryState {
	readonly commitId: number;
	readonly originType: string;
	readonly text: readonly BlockTextChange[];
	readonly structural: readonly StructuralChange[];
	readonly index: BlockIndexSnapshot;
	readonly postOrder?: readonly string[];
	readonly left?: ChangeSummary;
	readonly right?: ChangeSummary;
}

const internals = new WeakMap<ChangeSummary, ChangeSummaryState>();

export function createChangeSummary(state: ChangeSummaryState): ChangeSummary {
	const text = state.text;
	const structural = state.structural;
	const isEmpty = text.length === 0 && structural.length === 0;
	const summary: ChangeSummary = {
		commitId: state.commitId,
		originType: state.originType,
		text,
		structural,
		isEmpty,
		mapOffset(blockId, offset, assoc = DEFAULT_ASSOC, mode = DEFAULT_POINT_MAP_MODE) {
			return mapOffsetThrough(summary, blockId, offset, assoc, mode);
		},
		mapPoint(point, assoc = DEFAULT_ASSOC, mode = DEFAULT_POINT_MAP_MODE) {
			return mapPointThrough(summary, point, assoc, mode);
		},
		mapRange(range, options) {
			return mapRangeThrough(summary, range, options);
		},
		compose(next) {
			return composeSummaries(summary, next);
		},
	};
	internals.set(summary, {
		...state,
		postOrder: state.postOrder ?? applySummaryToSnapshot(state.index, summary).order,
	});
	return summary;
}

export function createEmptySummary(
	commitId: number,
	originType = "user",
	index: BlockIndexSnapshot = emptyBlockIndexSnapshot(),
): ChangeSummary {
	return createChangeSummary({
		commitId,
		originType,
		text: [],
		structural: [],
		index,
	});
}

export function getSummaryState(summary: ChangeSummary): ChangeSummaryState {
	return (
		internals.get(summary) ?? {
			commitId: summary.commitId,
			originType: summary.originType,
			text: summary.text,
			structural: summary.structural,
			index: emptyBlockIndexSnapshot(),
		}
	);
}

export function mapOffset(
	splices: readonly TextSplice[],
	offset: number,
	assoc: Assoc = DEFAULT_ASSOC,
	mode: PointMapMode = DEFAULT_POINT_MAP_MODE,
	length = Number.POSITIVE_INFINITY,
): number | null {
	const o = clampOffset(offset, length);
	let delta = 0;

	for (const splice of splices) {
		const deleted = splice.to - splice.from;
		if (o < splice.from) return o + delta;

		if (splice.from < o && o < splice.to) {
			if (mode === "clamp") return splice.from + delta;
			return null;
		}

		if (o === splice.from) {
			if (splice.insertLength > 0) {
				return assoc === -1
					? splice.from + delta
					: splice.from + delta + splice.insertLength;
			}
			if (deleted > 0) {
				if (mode === "delete-after") return null;
				return splice.from + delta;
			}
			continue;
		}

		if (o === splice.to && deleted > 0) {
			if (mode === "delete-before") return null;
			return splice.from + delta + splice.insertLength;
		}

		delta += splice.insertLength - deleted;
	}

	return o + delta;
}

function mapOffsetThrough(
	summary: ChangeSummary,
	blockId: string,
	offset: number,
	assoc: Assoc,
	mode: PointMapMode,
): number | null {
	const mapped = mapPointThrough(summary, { blockId, offset }, assoc, mode);
	return mapped?.offset ?? null;
}

function mapPointThrough(
	summary: ChangeSummary,
	point: Point,
	assoc: Assoc,
	mode: PointMapMode,
): Point | null {
	const state = getSummaryState(summary);
	if (state.left && state.right) {
		return mapPointComposed(state.left, state.right, point, assoc, mode);
	}
	return mapPointDirect(state, point, assoc, mode);
}

function mapPointComposed(
	left: ChangeSummary,
	right: ChangeSummary,
	point: Point,
	assoc: Assoc,
	mode: PointMapMode,
): Point | null {
	if (mode !== "clamp") {
		const leftTracked = mapPointThrough(left, point, assoc, mode);
		if (leftTracked == null) return null;
	}
	const mid = mapPointThrough(left, point, assoc, "clamp");
	if (mid == null) return mode === "clamp" ? mid : null;
	return mapPointThrough(right, mid, assoc, mode);
}

function mapPointDirect(
	state: ChangeSummaryState,
	point: Point,
	assoc: Assoc,
	mode: PointMapMode,
): Point | null {
	const length = state.index.lengthById.get(point.blockId);
	const clamped: Point = {
		blockId: point.blockId,
		offset: clampOffset(point.offset, length ?? 0),
	};

	const addressed = applyReaddressing(state.structural, clamped, assoc);
	const removed = removedBlockIds(state.structural);

	if (removed.has(addressed.blockId)) {
		if (mode !== "clamp") return null;
		const fallback = resolveRemovedBlock(addressed.blockId, state.index, removed);
		if (!fallback) return { blockId: addressed.blockId, offset: 0 };
		return applySplicesToPoint(state.text, fallback, assoc, "clamp");
	}

	return applySplicesToPoint(state.text, addressed, assoc, mode);
}

function applyReaddressing(
	structural: readonly StructuralChange[],
	point: Point,
	assoc: Assoc,
): Point {
	let current = point;
	for (const change of structural) {
		if (change.type === "blocks-merged" && current.blockId === change.sourceBlockId) {
			current = {
				blockId: change.targetBlockId,
				offset: change.joinOffset + current.offset,
			};
			continue;
		}
		if (change.type === "block-split" && current.blockId === change.blockId) {
			if (current.offset > change.offset) {
				current = {
					blockId: change.newBlockId,
					offset: current.offset - change.offset,
				};
			} else if (current.offset === change.offset && assoc === 1) {
				current = { blockId: change.newBlockId, offset: 0 };
			}
		}
	}
	return current;
}

function applySplicesToPoint(
	text: readonly BlockTextChange[],
	point: Point,
	assoc: Assoc,
	mode: PointMapMode,
): Point | null {
	const change = text.find((item) => item.blockId === point.blockId);
	if (!change) return point;
	const offset = mapOffset(change.splices, point.offset, assoc, mode);
	if (offset == null) return null;
	return { blockId: point.blockId, offset };
}

function resolveRemovedBlock(
	blockId: string,
	index: BlockIndexSnapshot,
	removed: ReadonlySet<string>,
): Point | null {
	const parentId = index.parentById.get(blockId) ?? null;
	const siblings = index.childrenByParentId.get(parentId) ?? [];
	const at = siblings.indexOf(blockId);

	for (let i = at + 1; i < siblings.length; i++) {
		const id = siblings[i];
		if (id && !removed.has(id)) return { blockId: id, offset: 0 };
	}
	for (let i = at - 1; i >= 0; i--) {
		const id = siblings[i];
		if (id && !removed.has(id)) {
			return { blockId: id, offset: index.lengthById.get(id) ?? 0 };
		}
	}

	const orderIndex = index.order.indexOf(blockId);
	for (let i = orderIndex + 1; i < index.order.length; i++) {
		const id = index.order[i];
		if (id && !removed.has(id)) return { blockId: id, offset: 0 };
	}
	for (let i = orderIndex - 1; i >= 0; i--) {
		const id = index.order[i];
		if (id && !removed.has(id)) {
			return { blockId: id, offset: index.lengthById.get(id) ?? 0 };
		}
	}
	return null;
}

function removedBlockIds(structural: readonly StructuralChange[]): Set<string> {
	const removed = new Set<string>();
	for (const change of structural) {
		if (change.type === "block-removed") removed.add(change.blockId);
		if (change.type === "blocks-merged") removed.add(change.sourceBlockId);
	}
	for (const change of structural) {
		if (change.type === "block-inserted") removed.delete(change.blockId);
		if (change.type === "block-split") removed.delete(change.newBlockId);
	}
	return removed;
}

function mapRangeThrough(
	summary: ChangeSummary,
	range: { anchor: Point; focus: Point },
	options?: { anchorAssoc?: Assoc; focusAssoc?: Assoc; mode?: PointMapMode },
): { anchor: Point; focus: Point } | null {
	const mode = options?.mode ?? DEFAULT_POINT_MAP_MODE;
	const anchor = mapPointThrough(
		summary,
		range.anchor,
		options?.anchorAssoc ?? DEFAULT_RANGE_ANCHOR_ASSOC,
		mode,
	);
	const focus = mapPointThrough(
		summary,
		range.focus,
		options?.focusAssoc ?? DEFAULT_RANGE_FOCUS_ASSOC,
		mode,
	);
	if (!anchor || !focus) return null;

	const order = getSummaryState(summary).postOrder ?? getSummaryState(summary).index.order;
	if (isReverseOrder(anchor, focus, order)) {
		return { anchor: focus, focus: anchor };
	}
	return { anchor, focus };
}

function isReverseOrder(anchor: Point, focus: Point, order: readonly string[]): boolean {
	if (anchor.blockId === focus.blockId) return anchor.offset > focus.offset;
	const a = order.indexOf(anchor.blockId);
	const b = order.indexOf(focus.blockId);
	if (a < 0 || b < 0) return false;
	return a > b;
}

function composeSummaries(first: ChangeSummary, second: ChangeSummary): ChangeSummary {
	const firstState = getSummaryState(first);
	const secondState = getSummaryState(second);
	return createChangeSummary({
		commitId: second.commitId,
		originType:
			first.originType === second.originType ? first.originType : second.originType,
		text: composeBlockText(first.text, second.text),
		structural: composeStructural(first.structural, second.structural),
		index: firstState.index,
		postOrder: secondState.postOrder ?? applySummaryToSnapshot(firstState.index, second).order,
		left: first,
		right: second,
	});
}

function clampOffset(offset: number, length: number): number {
	if (!Number.isFinite(offset)) return 0;
	if (offset < 0) return 0;
	if (offset > length) return length;
	return offset;
}
