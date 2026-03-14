import type { Editor } from "@pen/types";

export interface BenchFlowPatchAlignmentMetrics {
	preservedBlockCount: number;
	rewrittenBlockCount: number;
	unchangedBlockCount: number;
	insertedBlockCount: number;
	deletedBlockCount: number;
	estimatedOperationCost: number;
}

export interface BenchFlowPatchFallbackMetrics {
	kind: "scoped-replacement";
	opsCount: number;
	insertedBlockCount: number;
	deletedBlockCount: number;
	targetBlockCount: number;
}

export function buildBenchFlowPatchTextEditExecution(
	editor: Editor,
	blockId: string,
	text: string,
) {
	const block = editor.getBlock(blockId);
	if (!block) {
		return [];
	}
	return [{
		type: "replace-text" as const,
		blockId,
		offset: 0,
		length: block.length(),
		text,
	}];
}

export function buildBenchFlowPatchAlignmentExecution(editor: Editor) {
	const firstBlockId = editor.firstBlock()?.id;
	if (!firstBlockId) {
		return {
			ops: [],
			metrics: {
				preservedBlockCount: 0,
				rewrittenBlockCount: 0,
				unchangedBlockCount: 0,
				insertedBlockCount: 0,
				deletedBlockCount: 0,
				estimatedOperationCost: 0,
			} satisfies BenchFlowPatchAlignmentMetrics,
		};
	}

	return {
		ops: [
			{
				type: "insert-block" as const,
				blockId: "bench-inserted",
				blockType: "paragraph" as const,
				props: {},
				position: { after: "block-91" as const },
			},
			{
				type: "insert-text" as const,
				blockId: "bench-inserted",
				offset: 0,
				text: "Inserted middle benchmark block.",
			},
		],
		metrics: {
			preservedBlockCount: 3,
			rewrittenBlockCount: 0,
			unchangedBlockCount: 3,
			insertedBlockCount: 1,
			deletedBlockCount: 0,
			estimatedOperationCost: 2,
		} satisfies BenchFlowPatchAlignmentMetrics,
	};
}

export function buildBenchFlowPatchScopedReplacementExecution(editor: Editor) {
	const firstBlockId = editor.firstBlock()?.id;
	if (!firstBlockId) {
		return {
			ops: [],
			metrics: {
				kind: "scoped-replacement",
				opsCount: 0,
				insertedBlockCount: 0,
				deletedBlockCount: 0,
				targetBlockCount: 0,
			} satisfies BenchFlowPatchFallbackMetrics,
		};
	}

	return {
		ops: [
			{
				type: "insert-block" as const,
				blockId: "bench-replacement-1",
				blockType: "paragraph" as const,
				props: {},
				position: { before: "block-90" as const },
			},
			{
				type: "insert-text" as const,
				blockId: "bench-replacement-1",
				offset: 0,
				text: "Replacement intro benchmark block.",
			},
			{
				type: "delete-block" as const,
				blockId: "block-90",
			},
			{
				type: "delete-block" as const,
				blockId: "block-91",
			},
		],
		metrics: {
			kind: "scoped-replacement",
			opsCount: 4,
			insertedBlockCount: 1,
			deletedBlockCount: 2,
			targetBlockCount: 2,
		} satisfies BenchFlowPatchFallbackMetrics,
	};
}
