// @ts-nocheck
import type { DocumentOp, Editor } from "@pen/types";
import { buildDocumentWriteOps } from "@pen/document-ops";
import { generateId } from "@pen/types";
import type {
	BlockConvertPlan,
	BlockInsertPlan,
	BlockMovePlan,
	BlockUpdatePlan,
	DatabaseEditPlan,
	DocumentMutationPlan,
	FlowPatchEdit,
	FlowPatchPlan,
	ReviewBundlePlan,
	TextEditPlan,
} from "../planTypes";
import { buildDocumentMutationPlanExecution, buildPlanExecution, buildTextEditExecution, buildFlowPatchExecution, buildBlockInsertExecution } from "./planExecutorPart1";
import type { PlanExecutionIssue, PlanExecutionResult, PlanExecutionMetrics, FlowPatchAlignmentMetrics, VirtualBlockState, PlanExecutionContext, PendingInlineMark, PendingInlineBlock, InlineAlignmentStep, InlineAlignmentResolution } from "./planExecutorPart1";
import { buildFlowPatchEditExecution, buildOptimizedBlockReplacement, buildInlineBlockRewriteOps, buildInlineAlignmentOps, buildBlockUpdateExecution, isInlineConvertiblePendingBlock, isInlineConvertibleTargetBlock } from "./planExecutorPart2";
import { buildInlinePendingBlockInsertOps, resolveLastInsertedBlockId, resolveInsertionPosition, areRecordValuesEqual, buildBlockMoveExecution, buildBlockConvertExecution, buildDatabaseEditExecution, buildReviewBundleExecution, createVirtualBlockState, resolveBlockState, withIssue, stringifyRecord } from "./planExecutorPart4";
import { readDatabaseRowIds, stringifyDatabaseValue } from "./planExecutorPart5";

export function resolveInlineAlignmentPlan(
	targetBlocks: Array<NonNullable<ReturnType<Editor["getBlock"]>>>,
	parsedBlocks: PendingInlineBlock[],
): InlineAlignmentResolution {
	const costs = Array.from(
		{ length: targetBlocks.length + 1 },
		() => new Array<number>(parsedBlocks.length + 1).fill(0),
	);

	for (let targetIndex = targetBlocks.length - 1; targetIndex >= 0; targetIndex -= 1) {
		costs[targetIndex]![parsedBlocks.length] =
			estimateInlineDeleteCost(targetBlocks[targetIndex]!) +
			costs[targetIndex + 1]![parsedBlocks.length]!;
	}
	for (let parsedIndex = parsedBlocks.length - 1; parsedIndex >= 0; parsedIndex -= 1) {
		costs[targetBlocks.length]![parsedIndex] =
			estimateInlineInsertCost(parsedBlocks[parsedIndex]!) +
			costs[targetBlocks.length]![parsedIndex + 1]!;
	}

	for (let targetIndex = targetBlocks.length - 1; targetIndex >= 0; targetIndex -= 1) {
		for (let parsedIndex = parsedBlocks.length - 1; parsedIndex >= 0; parsedIndex -= 1) {
			const substituteCost =
				estimateInlineSubstituteCost(
					targetBlocks[targetIndex]!,
					parsedBlocks[parsedIndex]!,
				) + costs[targetIndex + 1]![parsedIndex + 1]!;
			const deleteCost =
				estimateInlineDeleteCost(targetBlocks[targetIndex]!) +
				costs[targetIndex + 1]![parsedIndex]!;
			const insertCost =
				estimateInlineInsertCost(parsedBlocks[parsedIndex]!) +
				costs[targetIndex]![parsedIndex + 1]!;
			costs[targetIndex]![parsedIndex] = Math.min(
				substituteCost,
				deleteCost,
				insertCost,
			);
		}
	}

	const alignment: InlineAlignmentStep[] = [];
	let targetIndex = 0;
	let parsedIndex = 0;
	while (targetIndex < targetBlocks.length && parsedIndex < parsedBlocks.length) {
		const bestCost = costs[targetIndex]![parsedIndex]!;
		const substituteCost =
			estimateInlineSubstituteCost(
				targetBlocks[targetIndex]!,
				parsedBlocks[parsedIndex]!,
			) + costs[targetIndex + 1]![parsedIndex + 1]!;
		const deleteCost =
			estimateInlineDeleteCost(targetBlocks[targetIndex]!) +
			costs[targetIndex + 1]![parsedIndex]!;
		const insertCost =
			estimateInlineInsertCost(parsedBlocks[parsedIndex]!) +
			costs[targetIndex]![parsedIndex + 1]!;

		if (
			substituteCost === bestCost &&
			shouldPreferInlineSubstitution(
				targetBlocks[targetIndex]!,
				parsedBlocks[parsedIndex]!,
				substituteCost,
				deleteCost,
				insertCost,
			)
		) {
			alignment.push({
				kind: "substitute",
				targetIndex,
				parsedIndex,
			});
			targetIndex += 1;
			parsedIndex += 1;
			continue;
		}

		if (deleteCost === bestCost && deleteCost <= insertCost) {
			alignment.push({
				kind: "delete",
				targetIndex,
			});
			targetIndex += 1;
			continue;
		}
		alignment.push({
			kind: "insert",
			parsedIndex,
		});
		parsedIndex += 1;
	}

	while (targetIndex < targetBlocks.length) {
		alignment.push({
			kind: "delete",
			targetIndex,
		});
		targetIndex += 1;
	}
	while (parsedIndex < parsedBlocks.length) {
		alignment.push({
			kind: "insert",
			parsedIndex,
		});
		parsedIndex += 1;
	}

	return {
		steps: alignment,
		metrics: summarizeInlineAlignment(alignment, targetBlocks, parsedBlocks, costs[0]?.[0] ?? 0),
	};
}

export function shouldPreferInlineSubstitution(
	targetBlock: NonNullable<ReturnType<Editor["getBlock"]>>,
	parsedBlock: PendingInlineBlock,
	substituteCost: number,
	deleteCost: number,
	insertCost: number,
): boolean {
	if (substituteCost < deleteCost && substituteCost < insertCost) {
		return true;
	}
	if (substituteCost > deleteCost || substituteCost > insertCost) {
		return false;
	}
	return areBlocksReusableMatch(targetBlock, parsedBlock);
}

export function estimateInlineSubstituteCost(
	targetBlock: NonNullable<ReturnType<Editor["getBlock"]>>,
	parsedBlock: PendingInlineBlock,
): number {
	return estimateInlineBlockRewriteCost(targetBlock, parsedBlock);
}

export function estimateInlineDeleteCost(
	_targetBlock: NonNullable<ReturnType<Editor["getBlock"]>>,
): number {
	return 1;
}

export function estimateInlineInsertCost(block: PendingInlineBlock): number {
	let cost = 1;
	if ((block.content ?? "").length > 0) {
		cost += 1;
	}
	for (const mark of block.marks ?? []) {
		if (mark.end > mark.start) {
			cost += 1;
		}
	}
	return cost;
}

export function estimateInlineBlockRewriteCost(
	targetBlock: NonNullable<ReturnType<Editor["getBlock"]>>,
	parsedBlock: PendingInlineBlock,
): number {
	let cost = 0;
	if (parsedBlock.type !== targetBlock.type) {
		cost += 1;
	} else if (!areRecordValuesEqual(targetBlock.props, parsedBlock.props)) {
		cost += 1;
	}

	const nextText = parsedBlock.content ?? "";
	if (targetBlock.textContent() !== nextText || (parsedBlock.marks?.length ?? 0) > 0) {
		cost += 1;
	}
	for (const mark of parsedBlock.marks ?? []) {
		if (mark.end > mark.start) {
			cost += 1;
		}
	}
	return cost;
}

export function summarizeInlineAlignment(
	alignment: InlineAlignmentStep[],
	targetBlocks: Array<NonNullable<ReturnType<Editor["getBlock"]>>>,
	parsedBlocks: PendingInlineBlock[],
	estimatedOperationCost: number,
): FlowPatchAlignmentMetrics {
	let preservedBlockCount = 0;
	let rewrittenBlockCount = 0;
	let unchangedBlockCount = 0;
	let insertedBlockCount = 0;
	let deletedBlockCount = 0;

	for (const step of alignment) {
		if (step.kind === "insert") {
			insertedBlockCount += 1;
			continue;
		}
		if (step.kind === "delete") {
			deletedBlockCount += 1;
			continue;
		}

		preservedBlockCount += 1;
		const rewriteCost = estimateInlineBlockRewriteCost(
			targetBlocks[step.targetIndex!]!,
			parsedBlocks[step.parsedIndex!]!,
		);
		if (rewriteCost > 0) {
			rewrittenBlockCount += 1;
		} else {
			unchangedBlockCount += 1;
		}
	}

	return {
		preservedBlockCount,
		rewrittenBlockCount,
		unchangedBlockCount,
		insertedBlockCount,
		deletedBlockCount,
		estimatedOperationCost,
	};
}

export function mergeFlowPatchAlignmentMetrics(
	left: FlowPatchAlignmentMetrics | undefined,
	right: FlowPatchAlignmentMetrics | undefined,
): FlowPatchAlignmentMetrics | undefined {
	if (!left) {
		return right;
	}
	if (!right) {
		return left;
	}
	return {
		preservedBlockCount: left.preservedBlockCount + right.preservedBlockCount,
		rewrittenBlockCount: left.rewrittenBlockCount + right.rewrittenBlockCount,
		unchangedBlockCount: left.unchangedBlockCount + right.unchangedBlockCount,
		insertedBlockCount: left.insertedBlockCount + right.insertedBlockCount,
		deletedBlockCount: left.deletedBlockCount + right.deletedBlockCount,
		estimatedOperationCost:
			left.estimatedOperationCost + right.estimatedOperationCost,
	};
}

export function areBlocksReusableMatch(
	targetBlock: NonNullable<ReturnType<Editor["getBlock"]>>,
	parsedBlock: PendingInlineBlock,
): boolean {
	return (
		targetBlock.type === parsedBlock.type &&
		areRecordValuesEqual(targetBlock.props, parsedBlock.props) &&
		areTextsReusableMatch(targetBlock.textContent(), parsedBlock.content ?? "")
	);
}

export function areTextsReusableMatch(left: string, right: string): boolean {
	const normalizedLeft = normalizeReusableText(left);
	const normalizedRight = normalizeReusableText(right);
	if (normalizedLeft === normalizedRight) {
		return true;
	}
	if (normalizedLeft.length === 0 || normalizedRight.length === 0) {
		return false;
	}
	if (
		normalizedLeft.includes(normalizedRight) ||
		normalizedRight.includes(normalizedLeft)
	) {
		return true;
	}
	const sharedBoundaryLength =
		resolveSharedPrefixLength(normalizedLeft, normalizedRight) +
		resolveSharedSuffixLength(normalizedLeft, normalizedRight);
	const minLength = Math.min(normalizedLeft.length, normalizedRight.length);
	if (sharedBoundaryLength < Math.ceil(minLength * 0.5)) {
		return false;
	}
	const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
	const maxDistance = Math.max(4, Math.floor(maxLength * 0.4));
	return resolveLevenshteinDistance(normalizedLeft, normalizedRight, maxDistance) <= maxDistance;
}

export function normalizeReusableText(text: string): string {
	return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolveSharedPrefixLength(left: string, right: string): number {
	let index = 0;
	while (index < left.length && index < right.length && left[index] === right[index]) {
		index += 1;
	}
	return index;
}

export function resolveSharedSuffixLength(left: string, right: string): number {
	let count = 0;
	while (
		count < left.length &&
		count < right.length &&
		left[left.length - 1 - count] === right[right.length - 1 - count]
	) {
		count += 1;
	}
	return count;
}

export function resolveLevenshteinDistance(
	left: string,
	right: string,
	maxDistance: number,
): number {
	const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	const current = new Array<number>(right.length + 1);

	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		current[0] = leftIndex;
		let rowMin = current[0]!;
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
			current[rightIndex] = Math.min(
				current[rightIndex - 1]! + 1,
				previous[rightIndex]! + 1,
				previous[rightIndex - 1]! + substitutionCost,
			);
			rowMin = Math.min(rowMin, current[rightIndex]!);
		}
		if (rowMin > maxDistance) {
			return maxDistance + 1;
		}
		for (let index = 0; index <= right.length; index += 1) {
			previous[index] = current[index]!;
		}
	}

	return previous[right.length]!;
}
