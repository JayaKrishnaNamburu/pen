import {
	normalizeReplacementRange,
	type ReplacementRangeBlock,
} from "./replacementPlan/replacementRange";
import {
	buildMultiBlockReplacementOperations,
	buildSingleBlockReplacementOperations,
	createDefaultReplacementBlockId,
	DEFAULT_INSERTED_BLOCK_TYPE,
	type ReplacementReviewOperation,
} from "./replacementPlan/rangeReplacementOps";
import {
	compileReplacementSuggestionOps,
	type CompileReplacementSuggestionOpsInput,
	type ReplacementTextDiffOperation,
} from "./replacementPlan/textDiffEngine";

export type { ReplacementRangeBlock } from "./replacementPlan/replacementRange";
export type {
	CompileReplacementSuggestionOpsInput,
	ReplacementTextDiffOperation,
} from "./replacementPlan/textDiffEngine";
export type { ReplacementReviewOperation } from "./replacementPlan/rangeReplacementOps";
export { compileReplacementSuggestionOps } from "./replacementPlan/textDiffEngine";

export interface CompileRangeReplacementSuggestionOpsInput {
	range: {
		start: { blockId: string; offset: number };
		end: { blockId: string; offset: number };
	};
	blocks: readonly ReplacementRangeBlock[];
	replacementText: string;
	blockType?: string;
	createBlockId?: () => string;
	maxDiffCells?: number;
}

export function compileRangeReplacementSuggestionOps({
	range,
	blocks,
	replacementText,
	blockType = DEFAULT_INSERTED_BLOCK_TYPE,
	createBlockId = createDefaultReplacementBlockId,
	maxDiffCells,
}: CompileRangeReplacementSuggestionOpsInput): ReplacementReviewOperation[] {
	const normalizedRange = normalizeReplacementRange(range, blocks);
	if (normalizedRange.start.blockId === normalizedRange.end.blockId) {
		const offset = Math.min(
			normalizedRange.start.offset,
			normalizedRange.end.offset,
		);
		const length = Math.abs(
			normalizedRange.end.offset - normalizedRange.start.offset,
		);
		const originalText = normalizedRange.startBlock.text.slice(
			offset,
			offset + length,
		);

		return buildSingleBlockReplacementOperations({
			blockId: normalizedRange.start.blockId,
			blockType,
			createBlockId,
			maxDiffCells,
			offset,
			originalText,
			replacementText,
		});
	}

	return buildMultiBlockReplacementOperations({
		blockType,
		createBlockId,
		maxDiffCells,
		normalizedRange,
		replacementText,
	});
}
