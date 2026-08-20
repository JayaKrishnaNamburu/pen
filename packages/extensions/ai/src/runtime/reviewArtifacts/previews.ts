import type { Editor } from "@input/pen-types";
import type { DocumentMutationPlan } from "../planTypes";
import type { StructuralReviewItem } from "./types";

export function describeTextEditLabel(
	operation: "replace" | "insert" | "append",
): string {
	if (operation === "replace") {
		return "Replace text";
	}
	if (operation === "insert") {
		return "Insert text";
	}
	return "Append text";
}

export function describeTextEditChangeKind(
	operation: "replace" | "insert" | "append",
): StructuralReviewItem["changeKind"] {
	return operation === "replace" ? "updated" : "added";
}

export function stringifyReviewValue(value: unknown): string | undefined {
	if (value == null) {
		return undefined;
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		// unstringifiable preview falls back to String().
		return String(value);
	}
}

export function readTextEditBefore(
	editor: Editor,
	plan: Extract<DocumentMutationPlan, { kind: "text_edit" }>,
): string | undefined {
	const block = editor.getBlock(plan.target.blockId);
	if (!block) {
		return undefined;
	}
	const text = block.textContent();
	if (plan.target.range) {
		return text.slice(
			plan.target.range.startOffset,
			plan.target.range.endOffset,
		);
	}
	return text;
}

export function readBlockPropsPreview(editor: Editor, blockId: string): string | undefined {
	const block = editor.getBlock(blockId);
	return block ? stringifyReviewValue(block.props) : undefined;
}

export function readBlockTypePreview(editor: Editor, blockId: string): string | undefined {
	const block = editor.getBlock(blockId);
	return block?.type;
}

export function describeInsertedBlockAfter(
	plan: Extract<DocumentMutationPlan, { kind: "block_insert" }>,
): string | undefined {
	if (plan.initialText) {
		return plan.initialText;
	}
	return plan.blockType;
}
