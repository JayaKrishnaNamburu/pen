import type { DocumentOp, Editor } from "@input/pen-types";
import { generateId } from "@input/pen-types";
import type {
	BlockConvertPlan,
	BlockInsertPlan,
	BlockMovePlan,
	BlockUpdatePlan,
	DocumentMutationPlan,
	ReviewBundlePlan,
	TextEditPlan,
} from "../planTypes";
import { buildFlowPatchExecution } from "./flowPatch";
import {
	createVirtualBlockState,
	resolveBlockState,
	withIssue,
} from "./state";
import type {
	PlanExecutionContext,
	PlanExecutionIssue,
	PlanExecutionResult,
} from "./types";

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
		case "review_bundle":
			return buildReviewBundleExecution(editor, plan, context);
		default: {
			const _exhaustive: never = plan;
			return _exhaustive;
		}
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
				type: "splice-text",
				blockId: plan.target.blockId,
				from: blockLength,
				to: blockLength,
				insert: plan.text,
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
				type: "splice-text",
				blockId: plan.target.blockId,
				from: offset,
				to: offset,
				insert: plan.text,
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
			type: "splice-text",
			blockId: plan.target.blockId,
			from: offset,
			to: offset + length,
			insert: plan.text,
		}],
		issues: [],
		reviewSafe: true,
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
			type: "splice-text",
			blockId,
			from: 0,
				to: 0,
				insert: plan.initialText,
		});
	}

	return {
		ops,
		issues: [],
		reviewSafe: true,
	};
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
			type: "set-props",
			blockId: plan.blockId,
			props: plan.props,
		}],
		issues: [],
		reviewSafe: false,
	};
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
			type: "set-props", blockId: plan.blockId, props: { type: plan.newType, ...plan.props },
		}],
		issues: [],
		reviewSafe: true,
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
