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
import { resolveInlineAlignmentPlan, shouldPreferInlineSubstitution, estimateInlineSubstituteCost, estimateInlineDeleteCost, estimateInlineInsertCost, estimateInlineBlockRewriteCost, summarizeInlineAlignment, mergeFlowPatchAlignmentMetrics, areBlocksReusableMatch, areTextsReusableMatch, normalizeReusableText, resolveSharedPrefixLength, resolveSharedSuffixLength, resolveLevenshteinDistance } from "./planExecutorPart3";
import { buildInlinePendingBlockInsertOps, resolveLastInsertedBlockId, resolveInsertionPosition, areRecordValuesEqual, buildBlockMoveExecution, buildBlockConvertExecution, buildDatabaseEditExecution, buildReviewBundleExecution, createVirtualBlockState, resolveBlockState, withIssue, stringifyRecord } from "./planExecutorPart4";

export function readDatabaseRowIds(
	block: ReturnType<Editor["getBlock"]>,
): string[] {
	if (!block) {
		return [];
	}
	const rowIds: string[] = [];
	for (let index = 0; index < block.tableRowCount(); index += 1) {
		const rowId = block.tableRow(index)?.id;
		if (rowId) {
			rowIds.push(rowId);
		}
	}
	return rowIds;
}

export function stringifyDatabaseValue(value: unknown): string {
	if (value == null) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
