import { INPUT_RULES_ENGINE_SLOT_KEY, supportsInlineInputRules } from "@pen/types";
import type { DocumentOp, Editor } from "@pen/types";
import { matchInlineInputRule } from "../utils/inlineInputRule";
import type { InlineInputRuleEngine } from "./crdt";

export type InlineInputRuleSelectionTarget = {
	blockId: string;
	anchorOffset: number;
	focusOffset: number;
};

export function applyInlineInputRule(
	editor: Editor,
	options: {
		blockId: string;
		offset: number;
		text: string;
	},
): InlineInputRuleSelectionTarget | null {
	const { blockId, offset, text } = options;
	if (text.length !== 1) {
		return null;
	}

	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}

	const blockSchema = editor.schema.resolve(block.type);
	if (!supportsInlineInputRules(blockSchema)) {
		return null;
	}

	const inputRuleEngine =
		editor.internals.getSlot<InlineInputRuleEngine>(
			INPUT_RULES_ENGINE_SLOT_KEY,
		) ?? null;
	const ops =
		inputRuleEngine?.tryMatchInline(editor, blockId, text, { offset }) ??
		resolveFallbackInlineInputRule(editor, blockId, block.textContent(), offset, text);
	if (!ops) {
		return null;
	}

	const selectionTarget = resolveInlineSelectionTarget(blockId, ops);
	if (!selectionTarget) {
		return null;
	}

	editor.apply(ops, { origin: "input-rule" });
	return selectionTarget;
}

function resolveFallbackInlineInputRule(
	editor: Editor,
	blockId: string,
	blockText: string,
	offset: number,
	text: string,
): DocumentOp[] | null {
	const match = matchInlineInputRule(blockText, offset, text);
	if (!match) {
		return null;
	}

	const markType = Object.keys(match.marks)[0];
	if (!markType || !editor.schema.resolveInline(markType)) {
		return null;
	}

	return [
		{
			type: "delete-text",
			blockId,
			offset: match.deleteRange.start,
			length: match.deleteRange.end - match.deleteRange.start,
		},
		{
			type: "insert-text",
			blockId,
			offset: match.deleteRange.start,
			text: match.text,
			marks: match.marks,
		},
	];
}

function resolveInlineSelectionTarget(
	blockId: string,
	ops: DocumentOp[],
): InlineInputRuleSelectionTarget | null {
	let nextOffset: number | null = null;
	for (const op of ops) {
		if (op.type === "insert-text" && op.blockId === blockId) {
			nextOffset = op.offset + op.text.length;
		}
	}

	if (nextOffset == null) {
		return null;
	}

	return {
		blockId,
		anchorOffset: nextOffset,
		focusOffset: nextOffset,
	};
}
