import type { DocumentOp, Editor } from "@input/pen-types";
import { buildDocumentWriteOps } from "@input/pen-document-ops";
import type { FlowPatchEdit, FlowPatchPlan } from "../planTypes";
import { mergeFlowPatchAlignmentMetrics, resolveInlineAlignmentPlan } from "./alignment";
import {
	buildInlineAlignmentOps,
	isInlineConvertiblePendingBlock,
	isInlineConvertibleTargetBlock,
} from "./inline";
import { withIssue } from "./state";
import type {
	FlowPatchAlignmentMetrics,
	PendingInlineBlock,
	PlanExecutionIssue,
	PlanExecutionResult,
} from "./types";

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
		default: {
			const _exhaustive: never = edit.operation;
			return _exhaustive;
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
