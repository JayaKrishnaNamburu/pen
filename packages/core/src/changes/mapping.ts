import { affectedBlockIdsFromSummary } from "./affectedBlocks";
import type { BlockIndexSnapshot } from "./blockIndex";
import type { BlockTextChange, ChangeSummary, StructuralChange } from "./types";

export interface ChangeSummaryState {
	readonly commitId: number;
	readonly blockText: readonly BlockTextChange[];
	readonly structural: readonly StructuralChange[];
	readonly index?: BlockIndexSnapshot;
}

export function createChangeSummary(state: ChangeSummaryState): ChangeSummary {
	const blockText = state.blockText;
	const structural = state.structural;
	return {
		commitId: state.commitId,
		blockText,
		structural,
		affectedBlockIds: affectedBlockIdsFromSummary(
			{ blockText, structural },
			state.index?.order,
		),
	};
}

export function createEmptySummary(commitId: number): ChangeSummary {
	return createChangeSummary({
		commitId,
		blockText: [],
		structural: [],
	});
}
