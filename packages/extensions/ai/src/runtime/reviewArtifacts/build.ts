import { resolveEditorMessage } from "@input/pen-core";
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
	StructuralReviewComparisonRow,
	StructuralReviewItem,
} from "./types";

export function buildStructuralReviewItems(
	editor: Editor,
	plan: DocumentMutationPlan,
): StructuralReviewItem[] {
	return buildReviewItemsForPlan(editor, plan, []);
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

function buildReviewItemsForPlan(
	editor: Editor,
	plan: DocumentMutationPlan,
	bundlePath: number[],
): StructuralReviewItem[] {
	switch (plan.kind) {
		case "text_edit":
			return [
				createReviewItem(bundlePath, plan.kind, "text", {
					changeKind: describeTextEditChangeKind(plan.operation),
					section: "content",
					groupId: `block:${plan.target.blockId}`,
					groupLabel: resolveEditorMessage(editor, "pen.ai.review.block", {
						blockId: plan.target.blockId,
					}),
					label: describeTextEditLabel(editor, plan.operation),
					summary: resolveEditorMessage(
						editor,
						"pen.ai.review.updateSelection",
					),
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
							? resolveEditorMessage(editor, "pen.ai.review.block", {
									blockId: edit.locator.blockId,
								})
							: resolveEditorMessage(editor, "pen.ai.review.span", {
									spanId: plan.targetSpanId ?? "flow-patch",
								}),
					label: resolveEditorMessage(editor, "pen.ai.review.flowPatch", {
						operation: edit.operation,
					}),
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
					groupLabel: resolveEditorMessage(editor, "pen.ai.review.blocks"),
					label: resolveEditorMessage(editor, "pen.ai.review.insertBlock"),
					summary: resolveEditorMessage(
						editor,
						"pen.ai.review.insertBlock.summary",
						{ blockType: plan.blockType },
					),
					detail: plan.blockType,
					preview: plan.initialText,
					before: resolveEditorMessage(editor, "pen.ai.review.newBlock"),
					after: describeInsertedBlockAfter(plan),
				}),
			];
		case "block_update":
			return [
				createReviewItem(bundlePath, plan.kind, "block", {
					changeKind: "updated",
					section: "block",
					groupId: `block:${plan.blockId}`,
					groupLabel: resolveEditorMessage(editor, "pen.ai.review.block", {
						blockId: plan.blockId,
					}),
					label: resolveEditorMessage(editor, "pen.ai.review.updateBlock"),
					summary: resolveEditorMessage(
						editor,
						"pen.ai.review.updateBlock.summary",
					),
					detail: resolveEditorMessage(editor, "pen.ai.review.propChanges", {
						count: Object.keys(plan.props).length,
					}),
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
					groupLabel: resolveEditorMessage(editor, "pen.ai.review.block", {
						blockId: plan.blockId,
					}),
					label: resolveEditorMessage(editor, "pen.ai.review.moveBlock"),
					summary: resolveEditorMessage(
						editor,
						"pen.ai.review.moveBlock.summary",
					),
				}),
			];
		case "block_convert":
			return [
				createReviewItem(bundlePath, plan.kind, "block", {
					changeKind: "updated",
					section: "block",
					groupId: `block:${plan.blockId}`,
					groupLabel: resolveEditorMessage(editor, "pen.ai.review.block", {
						blockId: plan.blockId,
					}),
					label: resolveEditorMessage(editor, "pen.ai.review.convertBlock"),
					summary: resolveEditorMessage(
						editor,
						"pen.ai.review.convertBlock.summary",
						{ newType: plan.newType },
					),
					detail: plan.newType,
					before: readBlockTypePreview(editor, plan.blockId),
					after: plan.newType,
				}),
			];
		case "review_bundle":
			return plan.plans.flatMap((nestedPlan, index) =>
				buildReviewItemsForPlan(editor, nestedPlan, [...bundlePath, index]),
			);
		default: {
			const _exhaustive: never = plan;
			return _exhaustive;
		}
	}
}

function createReviewItem(
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

function createReviewItemId(
	planKind: DocumentMutationPlan["kind"],
	bundlePath: number[],
	stepIndex: number | null,
): string {
	const pathPart = bundlePath.length > 0 ? bundlePath.join(".") : "root";
	const stepPart = stepIndex == null ? "plan" : `step-${stepIndex}`;
	return `plan:${planKind}:${pathPart}:${stepPart}`;
}
