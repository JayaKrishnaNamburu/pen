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
import { buildFlowPatchEditExecution, buildOptimizedBlockReplacement, buildInlineBlockRewriteOps, buildInlineAlignmentOps, buildBlockUpdateExecution, isInlineConvertiblePendingBlock, isInlineConvertibleTargetBlock } from "./planExecutorPart2";
import { resolveInlineAlignmentPlan, shouldPreferInlineSubstitution, estimateInlineSubstituteCost, estimateInlineDeleteCost, estimateInlineInsertCost, estimateInlineBlockRewriteCost, summarizeInlineAlignment, mergeFlowPatchAlignmentMetrics, areBlocksReusableMatch, areTextsReusableMatch, normalizeReusableText, resolveSharedPrefixLength, resolveSharedSuffixLength, resolveLevenshteinDistance } from "./planExecutorPart3";
import { buildInlinePendingBlockInsertOps, resolveLastInsertedBlockId, resolveInsertionPosition, areRecordValuesEqual, buildBlockMoveExecution, buildBlockConvertExecution, buildDatabaseEditExecution, buildReviewBundleExecution, createVirtualBlockState, resolveBlockState, withIssue, stringifyRecord } from "./planExecutorPart4";
import { readDatabaseRowIds, stringifyDatabaseValue } from "./planExecutorPart5";

export interface PlanExecutionIssue {
	path: string;
	code:
	| "missing-block"
	| "invalid-target"
	| "unsupported-target"
	| "invalid-range";
	message: string;
}

export interface PlanExecutionResult {
	ops: DocumentOp[];
	issues: PlanExecutionIssue[];
	reviewSafe: boolean;
	metrics?: PlanExecutionMetrics;
}

export interface PlanExecutionMetrics {
	flowPatchAlignment?: FlowPatchAlignmentMetrics;
}

export interface FlowPatchAlignmentMetrics {
	preservedBlockCount: number;
	rewrittenBlockCount: number;
	unchangedBlockCount: number;
	insertedBlockCount: number;
	deletedBlockCount: number;
	estimatedOperationCost: number;
}

export interface VirtualBlockState {
	type: string;
	props: Record<string, unknown>;
	textLength: number;
	database?: {
		columnIds: Set<string>;
		rowIds: Set<string>;
		viewIds: Set<string>;
	};
}

export interface PlanExecutionContext {
	virtualBlocks: Map<string, VirtualBlockState>;
}

export interface PendingInlineMark {
	type: string;
	props?: Record<string, unknown>;
	start: number;
	end: number;
}

export interface PendingInlineBlock {
	type: string;
	props: Record<string, unknown>;
	content?: string;
	marks?: PendingInlineMark[];
	children?: unknown[];
	database?: unknown;
}

export interface InlineAlignmentStep {
	kind: "substitute" | "insert" | "delete";
	targetIndex?: number;
	parsedIndex?: number;
}

export interface InlineAlignmentResolution {
	steps: InlineAlignmentStep[];
	metrics: FlowPatchAlignmentMetrics;
}

export function buildDocumentMutationPlanExecution(
	editor: Editor,
	plan: DocumentMutationPlan,
): PlanExecutionResult {
	const context: PlanExecutionContext = {
		virtualBlocks: new Map(),
	};
	return buildPlanExecution(editor, plan, context);
}

export function buildPlanExecution(
	editor: Editor,
	plan: DocumentMutationPlan,
	context: PlanExecutionContext,
): PlanExecutionResult {
	switch (plan.kind) {
		case "text_edit":
			return buildTextEditExecution(editor, plan, context);
		case "flow_patch":
			return buildFlowPatchExecution(editor, plan);
		case "block_insert":
			return buildBlockInsertExecution(editor, plan, context);
		case "block_update":
			return buildBlockUpdateExecution(editor, plan, context);
		case "block_move":
			return buildBlockMoveExecution(editor, plan, context);
		case "block_convert":
			return buildBlockConvertExecution(editor, plan, context);
		case "database_edit":
			return buildDatabaseEditExecution(editor, plan, context);
		case "review_bundle":
			return buildReviewBundleExecution(editor, plan, context);
	}
}

export function buildTextEditExecution(
	editor: Editor,
	plan: TextEditPlan,
	context: PlanExecutionContext,
): PlanExecutionResult {
	const blockState = resolveBlockState(editor, context, plan.target.blockId);
	if (!blockState) {
		return withIssue(
			`${plan.kind}.target.blockId`,
			"missing-block",
			`Block "${plan.target.blockId}" was not found.`,
		);
	}

	const blockLength = blockState.textLength;
	if (
		plan.target.range &&
		(plan.target.range.startOffset < 0 ||
			plan.target.range.endOffset < plan.target.range.startOffset ||
			plan.target.range.endOffset > blockLength)
	) {
		return withIssue(
			`${plan.kind}.target.range`,
			"invalid-range",
			"Text edit range is outside the target block.",
		);
	}

	if (plan.operation === "append") {
		context.virtualBlocks.set(plan.target.blockId, {
			...blockState,
			textLength: blockLength + plan.text.length,
		});
		return {
			ops: [{
				type: "insert-text",
				blockId: plan.target.blockId,
				offset: blockLength,
				text: plan.text,
			}],
			issues: [],
			reviewSafe: true,
		};
	}

	if (plan.operation === "insert") {
		const offset = plan.target.range?.startOffset ?? blockLength;
		context.virtualBlocks.set(plan.target.blockId, {
			...blockState,
			textLength: blockLength + plan.text.length,
		});
		return {
			ops: [{
				type: "insert-text",
				blockId: plan.target.blockId,
				offset,
				text: plan.text,
			}],
			issues: [],
			reviewSafe: true,
		};
	}

	const offset = plan.target.range?.startOffset ?? 0;
	const length =
		plan.target.range != null
			? plan.target.range.endOffset - plan.target.range.startOffset
			: blockLength;
	context.virtualBlocks.set(plan.target.blockId, {
		...blockState,
		textLength: blockLength - length + plan.text.length,
	});

	return {
		ops: [{
			type: "replace-text",
			blockId: plan.target.blockId,
			offset,
			length,
			text: plan.text,
		}],
		issues: [],
		reviewSafe: true,
	};
}

export function buildFlowPatchExecution(
	editor: Editor,
	plan: FlowPatchPlan,
): PlanExecutionResult {
	const ops: DocumentOp[] = [];
	const issues: PlanExecutionIssue[] = [];
	let reviewSafe = true;
	let flowPatchAlignmentMetrics: FlowPatchAlignmentMetrics | undefined;

	for (const [index, edit] of plan.edits.entries()) {
		const execution = buildFlowPatchEditExecution(editor, edit, `${plan.kind}.edits[${index}]`);
		ops.push(...execution.ops);
		issues.push(...execution.issues);
		reviewSafe = reviewSafe && execution.reviewSafe;
		flowPatchAlignmentMetrics = mergeFlowPatchAlignmentMetrics(
			flowPatchAlignmentMetrics,
			execution.metrics?.flowPatchAlignment,
		);
	}

	return {
		ops,
		issues,
		reviewSafe,
		metrics:
			flowPatchAlignmentMetrics == null
				? undefined
				: { flowPatchAlignment: flowPatchAlignmentMetrics },
	};
}

export function buildBlockInsertExecution(
	editor: Editor,
	plan: BlockInsertPlan,
	context: PlanExecutionContext,
): PlanExecutionResult {
	const blockId = plan.blockId ?? generateId();
	if (resolveBlockState(editor, context, blockId)) {
		return withIssue(
			`${plan.kind}.blockId`,
			"invalid-target",
			`Block "${blockId}" already exists.`,
		);
	}

	context.virtualBlocks.set(
		blockId,
		createVirtualBlockState(
			plan.blockType,
			plan.props ?? {},
			plan.initialText ?? "",
		),
	);
	const ops: DocumentOp[] = [{
		type: "insert-block",
		blockId,
		blockType: plan.blockType,
		props: plan.props ?? {},
		position: plan.position,
	}];

	if (plan.initialText && plan.initialText.length > 0) {
		ops.push({
			type: "insert-text",
			blockId,
			offset: 0,
			text: plan.initialText,
		});
	}

	return {
		ops,
		issues: [],
		reviewSafe: true,
	};
}
