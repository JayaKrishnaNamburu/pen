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
import { readDatabaseRowIds, stringifyDatabaseValue } from "./planExecutorPart5";

export function buildInlinePendingBlockInsertOps(
	blocks: PendingInlineBlock[],
	position: { before: string } | { after: string } | "last",
): DocumentOp[] {
	const ops: DocumentOp[] = [];
	let currentPosition = position;
	for (const block of blocks) {
		const blockId = generateId();
		ops.push({
			type: "insert-block",
			blockId,
			blockType: block.type,
			props: block.props,
			position: currentPosition,
		});
		if ((block.content ?? "").length > 0) {
			ops.push({
				type: "insert-text",
				blockId,
				offset: 0,
				text: block.content!,
			});
		}
		for (const mark of block.marks ?? []) {
			if (mark.end <= mark.start) {
				continue;
			}
			ops.push({
				type: "format-text",
				blockId,
				offset: mark.start,
				length: mark.end - mark.start,
				marks: { [mark.type]: mark.props ?? true },
			});
		}
		currentPosition = { after: blockId };
	}
	return ops;
}

export function resolveLastInsertedBlockId(ops: DocumentOp[]): string | null {
	for (let index = ops.length - 1; index >= 0; index -= 1) {
		const op = ops[index]!;
		if (op.type === "insert-block") {
			return op.blockId;
		}
	}
	return null;
}

export function resolveInsertionPosition(
	blockBefore: string | null,
	blockAfter: string | null,
): { before: string } | { after: string } | "last" {
	if (blockBefore) {
		return { after: blockBefore };
	}
	if (blockAfter) {
		return { before: blockAfter };
	}
	return "last";
}

export function areRecordValuesEqual(
	left: Record<string, unknown>,
	right: Record<string, unknown>,
): boolean {
	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	if (leftEntries.length !== rightEntries.length) {
		return false;
	}

	return leftEntries.every(([key, value]) => {
		if (!(key in right)) {
			return false;
		}
		return JSON.stringify(value) === JSON.stringify(right[key]);
	});
}

export function buildBlockMoveExecution(
	editor: Editor,
	plan: BlockMovePlan,
	context: PlanExecutionContext,
): PlanExecutionResult {
	if (!resolveBlockState(editor, context, plan.blockId)) {
		return withIssue(
			`${plan.kind}.blockId`,
			"missing-block",
			`Block "${plan.blockId}" was not found.`,
		);
	}

	return {
		ops: [{
			type: "move-block",
			blockId: plan.blockId,
			position: plan.position,
		}],
		issues: [],
		reviewSafe: true,
	};
}

export function buildBlockConvertExecution(
	editor: Editor,
	plan: BlockConvertPlan,
	context: PlanExecutionContext,
): PlanExecutionResult {
	const blockState = resolveBlockState(editor, context, plan.blockId);
	if (!blockState) {
		return withIssue(
			`${plan.kind}.blockId`,
			"missing-block",
			`Block "${plan.blockId}" was not found.`,
		);
	}
	context.virtualBlocks.set(
		plan.blockId,
		createVirtualBlockState(
			plan.newType,
			plan.props ?? blockState.props,
			blockState.textLength,
		),
	);

	return {
		ops: [{
			type: "convert-block",
			blockId: plan.blockId,
			newType: plan.newType,
			newProps: plan.props,
		}],
		issues: [],
		reviewSafe: true,
	};
}

export function buildDatabaseEditExecution(
	editor: Editor,
	plan: DatabaseEditPlan,
	context: PlanExecutionContext,
): PlanExecutionResult {
	const block = editor.getBlock(plan.blockId);
	const virtualBlock = context.virtualBlocks.get(plan.blockId) ?? null;
	const effectiveBlockType = virtualBlock?.type ?? block?.type ?? null;
	if (!effectiveBlockType) {
		return withIssue(
			`${plan.kind}.blockId`,
			"missing-block",
			`Block "${plan.blockId}" was not found.`,
		);
	}
	if (effectiveBlockType !== "database") {
		return withIssue(
			`${plan.kind}.blockId`,
			"unsupported-target",
			`Block "${plan.blockId}" is not a database block.`,
		);
	}

	const ops: DocumentOp[] = [];
	const knownColumnIds = new Set<string>([
		...(block?.type === "database"
			? block.tableColumns().map((column) => column.id)
			: []),
		...(virtualBlock?.database?.columnIds ?? []),
	]);
	const knownRowIds = new Set<string>([
		...(block?.type === "database" ? readDatabaseRowIds(block) : []),
		...(virtualBlock?.database?.rowIds ?? []),
	]);
	const knownViewIds = new Set<string>([
		...(block?.type === "database"
			? block.databaseViews().map((view) => view.id)
			: []),
		...(virtualBlock?.database?.viewIds ?? []),
	]);

	for (const step of plan.steps) {
		switch (step.op) {
			case "add_column":
				ops.push({
					type: "database-add-column",
					blockId: plan.blockId,
					column: step.column,
				});
				knownColumnIds.add(step.column.id);
				break;
			case "update_column":
				ops.push({
					type: "database-update-column",
					blockId: plan.blockId,
					columnId: step.columnId,
					patch: step.patch,
				});
				break;
			case "insert_row": {
				const rowId = step.rowId ?? generateId();
				ops.push({
					type: "database-insert-row",
					blockId: plan.blockId,
					rowId,
					values: stringifyRecord(step.values),
				});
				knownRowIds.add(rowId);
				break;
			}
			case "update_cell":
				ops.push({
					type: "database-update-cell",
					blockId: plan.blockId,
					rowId: step.rowId,
					columnId: step.columnId,
					value: stringifyDatabaseValue(step.value),
				});
				break;
			case "add_view":
				ops.push({
					type: "database-add-view",
					blockId: plan.blockId,
					view: step.view,
				});
				knownViewIds.add(step.view.id);
				break;
			case "set_active_view":
				ops.push({
					type: "database-set-active-view",
					blockId: plan.blockId,
					viewId: step.viewId,
				});
				break;
		}
	}

	if (virtualBlock?.database) {
		virtualBlock.database.columnIds = knownColumnIds;
		virtualBlock.database.rowIds = knownRowIds;
		virtualBlock.database.viewIds = knownViewIds;
	}

	return {
		ops,
		issues: [],
		reviewSafe: false,
	};
}

export function buildReviewBundleExecution(
	editor: Editor,
	plan: ReviewBundlePlan,
	context: PlanExecutionContext,
): PlanExecutionResult {
	const ops: DocumentOp[] = [];
	const issues: PlanExecutionIssue[] = [];
	let reviewSafe = true;

	for (let index = 0; index < plan.plans.length; index += 1) {
		const nestedPlan = plan.plans[index]!;
		const execution = buildPlanExecution(editor, nestedPlan, context);
		ops.push(...execution.ops);
		issues.push(
			...execution.issues.map((issue) => ({
				...issue,
				path: `${plan.kind}.plans[${index}].${issue.path}`,
			})),
		);
		reviewSafe &&= execution.reviewSafe;
	}

	return {
		ops,
		issues,
		reviewSafe,
	};
}

export function createVirtualBlockState(
	blockType: string,
	props: Record<string, unknown> = {},
	text: string | number = 0,
): VirtualBlockState {
	const textLength = typeof text === "number" ? text : text.length;
	if (blockType === "database") {
		return {
			type: blockType,
			props,
			textLength,
			database: {
				columnIds: new Set(),
				rowIds: new Set(),
				viewIds: new Set(),
			},
		};
	}
	return {
		type: blockType,
		props,
		textLength,
	};
}

export function resolveBlockState(
	editor: Editor,
	context: PlanExecutionContext,
	blockId: string,
): VirtualBlockState | null {
	const virtualBlock = context.virtualBlocks.get(blockId) ?? null;
	if (virtualBlock) {
		return virtualBlock;
	}

	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}

	const nextState = createVirtualBlockState(
		block.type,
		{ ...block.props },
		block.length(),
	);
	if (block.type === "database") {
		nextState.database = {
			columnIds: new Set(block.tableColumns().map((column) => column.id)),
			rowIds: new Set(readDatabaseRowIds(block)),
			viewIds: new Set(block.databaseViews().map((view) => view.id)),
		};
	}
	return nextState;
}

export function withIssue(
	path: string,
	code: PlanExecutionIssue["code"],
	message: string,
): PlanExecutionResult {
	return {
		ops: [],
		issues: [{ path, code, message }],
		reviewSafe: false,
	};
}

export function stringifyRecord(
	value: Record<string, unknown>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(value).map(([key, entryValue]) => [
			key,
			stringifyDatabaseValue(entryValue),
		]),
	);
}
