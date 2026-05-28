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
import { resolveInlineAlignmentPlan, shouldPreferInlineSubstitution, estimateInlineSubstituteCost, estimateInlineDeleteCost, estimateInlineInsertCost, estimateInlineBlockRewriteCost, summarizeInlineAlignment, mergeFlowPatchAlignmentMetrics, areBlocksReusableMatch, areTextsReusableMatch, normalizeReusableText, resolveSharedPrefixLength, resolveSharedSuffixLength, resolveLevenshteinDistance } from "./planExecutorPart3";
import { buildInlinePendingBlockInsertOps, resolveLastInsertedBlockId, resolveInsertionPosition, areRecordValuesEqual, buildBlockMoveExecution, buildBlockConvertExecution, buildDatabaseEditExecution, buildReviewBundleExecution, createVirtualBlockState, resolveBlockState, withIssue, stringifyRecord } from "./planExecutorPart4";
import { readDatabaseRowIds, stringifyDatabaseValue } from "./planExecutorPart5";

export function buildFlowPatchEditExecution(
	editor: Editor,
	edit: FlowPatchEdit,
	path: string,
): PlanExecutionResult {
	const targetBlockIds =
		edit.locator.blockIds?.filter((blockId) => blockId.length > 0) ??
		(edit.locator.blockId ? [edit.locator.blockId] : []);
	const primaryBlockId = targetBlockIds[0] ?? null;
	const primaryBlock = primaryBlockId ? editor.getBlock(primaryBlockId) : null;

	if (
		edit.locator.expectedBlockType &&
		primaryBlock &&
		primaryBlock.type !== edit.locator.expectedBlockType
	) {
		return withIssue(
			`${path}.locator.expectedBlockType`,
			"unsupported-target",
			`Block "${primaryBlock.id}" is "${primaryBlock.type}", expected "${edit.locator.expectedBlockType}".`,
		);
	}

	switch (edit.operation) {
		case "replace_text": {
			if (!primaryBlockId || !primaryBlock) {
				return withIssue(
					`${path}.locator.blockId`,
					"missing-block",
					"Flow patch replace_text requires an existing target block.",
				);
			}
			return {
				ops: [{
					type: "replace-text",
					blockId: primaryBlockId,
					offset: 0,
					length: primaryBlock.length(),
					text: edit.text ?? "",
				}],
				issues: [],
				reviewSafe: true,
			};
		}
		case "append_text": {
			if (!primaryBlockId || !primaryBlock) {
				return withIssue(
					`${path}.locator.blockId`,
					"missing-block",
					"Flow patch append_text requires an existing target block.",
				);
			}
			return {
				ops: [{
					type: "insert-text",
					blockId: primaryBlockId,
					offset: primaryBlock.length(),
					text: edit.text ?? "",
				}],
				issues: [],
				reviewSafe: true,
			};
		}
		case "insert_before":
		case "insert_after": {
			if (!primaryBlockId || !primaryBlock) {
				return withIssue(
					`${path}.locator.blockId`,
					"missing-block",
					`Flow patch ${edit.operation} requires an existing target block.`,
				);
			}
			const { ops } = buildDocumentWriteOps(editor, {
				format: "markdown",
				content: edit.markdown ?? "",
				position:
					edit.operation === "insert_before"
						? { before: primaryBlockId }
						: { after: primaryBlockId },
				surface: "ai-flow-patch",
			});
			return {
				ops,
				issues: [],
				reviewSafe: true,
			};
		}
		case "replace_blocks": {
			if (targetBlockIds.length === 0) {
				return withIssue(
					`${path}.locator.blockIds`,
					"missing-block",
					"Flow patch replace_blocks requires one or more target blocks.",
				);
			}
			if (targetBlockIds.some((blockId) => !editor.getBlock(blockId))) {
				return withIssue(
					`${path}.locator.blockIds`,
					"missing-block",
					"Flow patch replace_blocks targets a missing block.",
				);
			}
			const optimized = buildOptimizedBlockReplacement(
				editor,
				targetBlockIds,
				edit.markdown ?? "",
			);
			if (optimized) {
				return optimized;
			}
			const { ops } = buildDocumentWriteOps(editor, {
				format: "markdown",
				content: edit.markdown ?? "",
				position: { before: targetBlockIds[0]! },
				surface: "ai-flow-patch",
			});
			return {
				ops: [
					...ops,
					...targetBlockIds.map((blockId) => ({
						type: "delete-block",
						blockId,
					}) satisfies DocumentOp),
				],
				issues: [],
				reviewSafe: true,
			};
		}
		case "delete_blocks": {
			if (targetBlockIds.length === 0) {
				return withIssue(
					`${path}.locator.blockIds`,
					"missing-block",
					"Flow patch delete_blocks requires one or more target blocks.",
				);
			}
			if (targetBlockIds.some((blockId) => !editor.getBlock(blockId))) {
				return withIssue(
					`${path}.locator.blockIds`,
					"missing-block",
					"Flow patch delete_blocks targets a missing block.",
				);
			}
			return {
				ops: targetBlockIds.map((blockId) => ({
					type: "delete-block",
					blockId,
				}) satisfies DocumentOp),
				issues: [],
				reviewSafe: true,
			};
		}
	}
}

export function buildOptimizedBlockReplacement(
	editor: Editor,
	targetBlockIds: string[],
	markdown: string,
): PlanExecutionResult | null {
	if (targetBlockIds.length === 0) {
		return null;
	}

	const targetBlocks = targetBlockIds
		.map((blockId) => editor.getBlock(blockId))
		.filter((block): block is NonNullable<typeof block> => block != null);
	if (targetBlocks.length !== targetBlockIds.length) {
		return null;
	}

	const parsedBlocks = buildDocumentWriteOps(editor, {
		format: "markdown",
		content: markdown,
		surface: "ai-flow-patch-optimize",
	}).blocks as PendingInlineBlock[];
	if (
		parsedBlocks.some((parsedBlock) => !isInlineConvertiblePendingBlock(parsedBlock))
	) {
		return null;
	}
	if (targetBlocks.some((block) => !isInlineConvertibleTargetBlock(block))) {
		return null;
	}

	const alignment = resolveInlineAlignmentPlan(targetBlocks, parsedBlocks);
	const ops = buildInlineAlignmentOps(alignment.steps, targetBlocks, parsedBlocks);

	return {
		ops,
		issues: [],
		reviewSafe: true,
		metrics: {
			flowPatchAlignment: alignment.metrics,
		},
	};
}

export function buildInlineBlockRewriteOps(
	targetBlock: NonNullable<ReturnType<Editor["getBlock"]>>,
	parsedBlock: PendingInlineBlock,
): DocumentOp[] {
	const ops: DocumentOp[] = [];
	if (parsedBlock.type !== targetBlock.type) {
		ops.push({
			type: "convert-block",
			blockId: targetBlock.id,
			newType: parsedBlock.type,
			newProps: parsedBlock.props,
		});
	} else if (!areRecordValuesEqual(targetBlock.props, parsedBlock.props)) {
		ops.push({
			type: "update-block",
			blockId: targetBlock.id,
			props: parsedBlock.props,
		});
	}

	const nextText = parsedBlock.content ?? "";
	const needsTextRewrite =
		targetBlock.textContent() !== nextText || (parsedBlock.marks?.length ?? 0) > 0;
	if (needsTextRewrite) {
		ops.push({
			type: "replace-text",
			blockId: targetBlock.id,
			offset: 0,
			length: targetBlock.length(),
			text: nextText,
		});
		for (const mark of parsedBlock.marks ?? []) {
			if (mark.end <= mark.start) {
				continue;
			}
			ops.push({
				type: "format-text",
				blockId: targetBlock.id,
				offset: mark.start,
				length: mark.end - mark.start,
				marks: { [mark.type]: mark.props ?? true },
			});
		}
	}

	return ops;
}

export function buildInlineAlignmentOps(
	alignment: InlineAlignmentStep[],
	targetBlocks: Array<NonNullable<ReturnType<Editor["getBlock"]>>>,
	parsedBlocks: PendingInlineBlock[],
): DocumentOp[] {
	const ops: DocumentOp[] = [];
	const pendingInserts: PendingInlineBlock[] = [];
	let blockBefore: string | null = null;

	for (const step of alignment) {
		if (step.kind === "insert") {
			pendingInserts.push(parsedBlocks[step.parsedIndex!]!);
			continue;
		}

		if (step.kind === "substitute") {
			const targetBlock = targetBlocks[step.targetIndex!]!;
			if (pendingInserts.length > 0) {
				const insertOps = buildInlinePendingBlockInsertOps(
					pendingInserts,
					resolveInsertionPosition(blockBefore, targetBlock.id),
				);
				ops.push(...insertOps);
				blockBefore = resolveLastInsertedBlockId(insertOps) ?? blockBefore;
				pendingInserts.length = 0;
			}
			ops.push(
				...buildInlineBlockRewriteOps(
					targetBlock,
					parsedBlocks[step.parsedIndex!]!,
				),
			);
			blockBefore = targetBlock.id;
			continue;
		}

		ops.push({
			type: "delete-block",
			blockId: targetBlocks[step.targetIndex!]!.id,
		});
	}

	if (pendingInserts.length > 0) {
		ops.push(
			...buildInlinePendingBlockInsertOps(
				pendingInserts,
				resolveInsertionPosition(blockBefore, null),
			),
		);
	}

	return ops;
}

export function buildBlockUpdateExecution(
	editor: Editor,
	plan: BlockUpdatePlan,
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
	context.virtualBlocks.set(plan.blockId, {
		...blockState,
		props: plan.props,
	});

	return {
		ops: [{
			type: "update-block",
			blockId: plan.blockId,
			props: plan.props,
		}],
		issues: [],
		reviewSafe: false,
	};
}

export function isInlineConvertiblePendingBlock(
	block: PendingInlineBlock,
): boolean {
	return (
		(block.children?.length ?? 0) === 0 &&
		block.database == null &&
		block.type !== "table" &&
		block.type !== "database"
	);
}

export function isInlineConvertibleTargetBlock(
	block: NonNullable<ReturnType<Editor["getBlock"]>>,
): boolean {
	return block.children.length === 0 && block.type !== "table" && block.type !== "database";
}
