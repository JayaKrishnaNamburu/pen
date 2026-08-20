import type { Editor } from "@input/pen-types";
import type { DocumentMutationPlan } from "../planTypes";
import { removePlanAtPath, selectPlanAtPath } from "./paths";
import {
	describeInsertedBlockAfter,
	describeTextEditChangeKind,
	describeTextEditLabel,
	readBlockPropsPreview,
	readBlockTypePreview,
	readTextEditBefore,
	stringifyReviewValue,
} from "./previews";
import type {
	StructuralReviewBuildContext,
	StructuralReviewComparisonRow,
	StructuralReviewItem,
	StructuredPreviewTargetState,
	VirtualReviewBlock,
} from "./types";

export function buildStructuralReviewItems(
	editor: Editor,
	plan: DocumentMutationPlan,
): StructuralReviewItem[] {
	return buildStructuralPreviewArtifacts(editor, plan).reviewItems;
}

export function buildStructuredPreviewTargets(
	editor: Editor,
	plan: DocumentMutationPlan,
): StructuredPreviewTargetState[] {
	return buildStructuralPreviewArtifacts(editor, plan).targets;
}

export function buildStructuralPreviewArtifacts(
	editor: Editor,
	plan: DocumentMutationPlan,
): {
	reviewItems: StructuralReviewItem[];
	targets: StructuredPreviewTargetState[];
} {
	const context: StructuralReviewBuildContext = {
		virtualBlocks: new Map(),
	};
	const reviewItems = buildReviewItemsForPlan(editor, plan, [], context);
	return {
		reviewItems,
		targets: serializeStructuredPreviewTargets(context.virtualBlocks),
	};
}

export function selectStructuralReviewItemPlan(
	plan: DocumentMutationPlan,
	item: StructuralReviewItem,
): DocumentMutationPlan | null {
	return selectPlanAtPath(plan, item.bundlePath, item.stepIndex);
}

export function removeStructuralReviewItemPlan(
	plan: DocumentMutationPlan,
	item: StructuralReviewItem,
): DocumentMutationPlan | null {
	return removePlanAtPath(plan, item.bundlePath, item.stepIndex);
}

export function buildReviewItemsForPlan(
	editor: Editor,
	plan: DocumentMutationPlan,
	bundlePath: number[],
	context: StructuralReviewBuildContext,
): StructuralReviewItem[] {
	switch (plan.kind) {
		case "text_edit":
			return [
				createReviewItem(bundlePath, plan.kind, "text", {
					changeKind: describeTextEditChangeKind(plan.operation),
					section: "content",
					groupId: `block:${plan.target.blockId}`,
					groupLabel: `Block "${plan.target.blockId}"`,
					label: describeTextEditLabel(plan.operation),
					summary: "Updates the selected text range.",
					preview: plan.text,
					before: readTextEditBefore(editor, plan),
					after: plan.text,
				}),
			];
		case "flow_patch":
			return plan.edits.map((edit, index) =>
				createReviewItem(bundlePath, plan.kind, "text", {
					changeKind:
						edit.operation === "append_text" || edit.operation === "insert_after" || edit.operation === "insert_before"
							? "added"
							: edit.operation === "delete_blocks"
								? "removed"
								: "updated",
					section: "content",
					groupId:
						edit.locator.blockId != null
							? `block:${edit.locator.blockId}`
							: `span:${plan.targetSpanId ?? "flow-patch"}`,
					groupLabel:
						edit.locator.blockId != null
							? `Block "${edit.locator.blockId}"`
							: `Span "${plan.targetSpanId ?? "flow-patch"}"`,
					label: `Flow patch: ${edit.operation}`,
					summary: plan.instructions,
					detail: edit.locator.expectedBlockType,
					preview: edit.text ?? edit.markdown,
					before:
						edit.locator.blockId != null
							? editor.getBlock(edit.locator.blockId)?.textContent() ?? undefined
							: undefined,
					after: edit.text ?? edit.markdown,
					stepIndex: index,
				}),
			);
		case "block_insert":
			return [
				createReviewItem(bundlePath, plan.kind, "block", {
					changeKind: "added",
					section: "block",
					groupId: "blocks",
					groupLabel: "Blocks",
					label: "Insert block",
					summary: `Adds a new ${plan.blockType} block.`,
					detail: plan.blockType,
					preview: plan.initialText,
					before: "(new block)",
					after: describeInsertedBlockAfter(plan),
				}),
			];
		case "block_update":
			return [
				createReviewItem(bundlePath, plan.kind, "block", {
					changeKind: "updated",
					section: "block",
					groupId: `block:${plan.blockId}`,
					groupLabel: `Block "${plan.blockId}"`,
					label: "Update block",
					summary: "Updates block properties.",
					detail: `${Object.keys(plan.props).length} prop changes`,
					before: readBlockPropsPreview(editor, plan.blockId),
					after: stringifyReviewValue(plan.props),
				}),
			];
		case "block_move":
			return [
				createReviewItem(bundlePath, plan.kind, "block", {
					changeKind: "moved",
					section: "block",
					groupId: `block:${plan.blockId}`,
					groupLabel: `Block "${plan.blockId}"`,
					label: "Move block",
					summary: "Moves this block to a new position.",
				}),
			];
		case "block_convert":
			return [
				createReviewItem(bundlePath, plan.kind, "block", {
					changeKind: "updated",
					section: "block",
					groupId: `block:${plan.blockId}`,
					groupLabel: `Block "${plan.blockId}"`,
					label: "Convert block",
					summary: `Converts this block to ${plan.newType}.`,
					detail: plan.newType,
					before: readBlockTypePreview(editor, plan.blockId),
					after: plan.newType,
				}),
			];
		case "review_bundle":
			return plan.plans.flatMap((nestedPlan, index) =>
				buildReviewItemsForPlan(editor, nestedPlan, [...bundlePath, index], context),
			);
		default: {
			const _exhaustive: never = plan;
			return _exhaustive;
		}
	}
}

export function serializeStructuredPreviewTargets(
	_virtualBlocks: Map<string, VirtualReviewBlock>,
): StructuredPreviewTargetState[] {
	return [];
}

export function createReviewItem(
	bundlePath: number[],
	planKind: DocumentMutationPlan["kind"],
	targetKind: StructuralReviewItem["targetKind"],
	input: {
		changeKind: StructuralReviewItem["changeKind"];
		section: StructuralReviewItem["section"];
		groupId: string;
		groupLabel: string;
		label: string;
		summary: string;
		detail?: string;
		preview?: string;
		before?: string;
		after?: string;
		comparisonRows?: StructuralReviewComparisonRow[];
		stepIndex?: number;
	},
): StructuralReviewItem {
	const stepIndex = input.stepIndex ?? null;
	return {
		id: createReviewItemId(planKind, bundlePath, stepIndex),
		targetKind,
		planKind,
		changeKind: input.changeKind,
		section: input.section,
		groupId: input.groupId,
		groupLabel: input.groupLabel,
		label: input.label,
		summary: input.summary,
		detail: input.detail,
		preview: input.preview,
		before: input.before,
		after: input.after,
		comparisonRows: input.comparisonRows,
		bundlePath,
		stepIndex,
	};
}

export function createReviewItemId(
	planKind: DocumentMutationPlan["kind"],
	bundlePath: number[],
	stepIndex: number | null,
): string {
	const pathPart = bundlePath.length > 0 ? bundlePath.join(".") : "root";
	const stepPart = stepIndex == null ? "plan" : `step-${stepIndex}`;
	return `plan:${planKind}:${pathPart}:${stepPart}`;
}
