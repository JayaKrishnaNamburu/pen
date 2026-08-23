import type {
	Assoc,
	BlockTextChange,
	ChangeSummary,
	StructuralChange,
	TextSplice,
} from "./types";

export const DEFAULT_ASSOC: Assoc = 1;

export interface ChangeSummaryState {
	readonly commitId: number;
	readonly originType: string;
	readonly text: readonly BlockTextChange[];
	readonly structural: readonly StructuralChange[];
	readonly index?: unknown;
}

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
		mapOffset(blockId, offset, assoc = DEFAULT_ASSOC) {
			const change = text.find((item) => item.blockId === blockId);
			if (!change) {
				return offset;
			}
			return mapOffsetThroughSplices(change.splices, offset, assoc);
		},
		mapPoint(point, assoc = DEFAULT_ASSOC) {
			return {
				blockId: point.blockId,
				offset: summary.mapOffset(point.blockId, point.offset, assoc) ?? point.offset,
			};
		},
		mapRange(range, options) {
			const collapsed =
				range.anchor.blockId === range.focus.blockId &&
				range.anchor.offset === range.focus.offset;
			const anchorAssoc =
				options?.anchorAssoc ?? (collapsed ? DEFAULT_ASSOC : -1);
			const focusAssoc =
				options?.focusAssoc ?? (collapsed ? DEFAULT_ASSOC : 1);
			const anchor = summary.mapPoint(range.anchor, anchorAssoc);
			const focus = collapsed
				? anchor
				: summary.mapPoint(range.focus, focusAssoc);
			if (!anchor || !focus) {
				return null;
			}
			return { anchor, focus };
		},
		compose(next) {
			return next;
		},
	};
	return summary;
}

export function createEmptySummary(
	commitId: number,
	originType = "user",
): ChangeSummary {
	return createChangeSummary({
		commitId,
		originType,
		text: [],
		structural: [],
	});
}

function mapOffsetThroughSplices(
	splices: readonly TextSplice[],
	offset: number,
	assoc: Assoc,
): number {
	let delta = 0;
	for (const splice of splices) {
		const deleted = splice.to - splice.from;
		if (offset < splice.from) {
			return offset + delta;
		}
		if (splice.from < offset && offset < splice.to) {
			return splice.from + delta;
		}
		if (offset === splice.from) {
			if (splice.insertLength > 0) {
				return assoc === -1
					? splice.from + delta
					: splice.from + delta + splice.insertLength;
			}
			if (deleted > 0) {
				return splice.from + delta;
			}
			continue;
		}
		if (offset === splice.to && deleted > 0) {
			return splice.from + delta + splice.insertLength;
		}
		delta += splice.insertLength - deleted;
	}
	return offset + delta;
}
