import { INPUT_RULES_ENGINE_SLOT_KEY, generateId } from "@pen/types";
import type { DocumentOp, Editor } from "@pen/types";
import {
	toggleInlineMark as toggleInlineMarkCommand,
	setInlineMark as setInlineMarkCommand,
} from "@pen/shortcuts";
import { matchListInputRule } from "../utils/listInputRule";
import {
	getLogicalInlineLength,
	type BlockInputRuleEngine,
	type InlineTextLike,
	type SelectionRange,
	type SelectionTarget,
} from "./commandsShared";

export function normalizeInlineOffset(
	ytext: InlineTextLike,
	offset: number,
): number {
	return Math.max(0, Math.min(offset, getLogicalInlineLength(ytext)));
}

export function toggleInlineMark(editor: Editor, markType: string): boolean {
	return toggleInlineMarkCommand(editor, markType);
}

export function setInlineMark(
	editor: Editor,
	markType: string,
	value: Record<string, unknown> | null,
): boolean {
	return setInlineMarkCommand(editor, markType, value);
}

// ── Commands ─────────────────────────────────────────────────

export function splitBlockAtOffset(
	editor: Editor,
	options: {
		blockId: string;
		offset: number;
		newBlockType?: string;
	},
): SelectionTarget {
	const { blockId, offset, newBlockType } = options;
	const newBlockId = generateId();

	editor.apply([
		{
			type: "split-block",
			blockId,
			offset,
			newBlockId,
			newBlockType,
		} as DocumentOp,
	]);

	return {
		blockId: newBlockId,
		anchorOffset: 0,
		focusOffset: 0,
	};
}

export function convertBlock(
	editor: Editor,
	options: {
		blockId: string;
		newType: string;
		newProps?: Record<string, unknown>;
	},
): SelectionTarget {
	editor.apply(getConvertBlockOps(editor, options), { origin: "user" });

	return {
		blockId: options.blockId,
		anchorOffset: 0,
		focusOffset: 0,
	};
}

export function getConvertBlockOps(
	editor: Editor,
	options: {
		blockId: string;
		newType: string;
		newProps?: Record<string, unknown>;
	},
): DocumentOp[] {
	const existingParentId = editor.documentState.parentOf(options.blockId);
	const ops: DocumentOp[] = [
		{
			type: "convert-block",
			blockId: options.blockId,
			newType: options.newType,
			newProps: options.newProps,
		} as DocumentOp,
	];

	if (existingParentId) {
		ops.push({
			type: "update-block",
			blockId: options.blockId,
			props: { parentId: existingParentId },
		} as DocumentOp);
	}

	return ops;
}

export function insertTextAtRange(
	editor: Editor,
	options: {
		blockId: string;
		range: SelectionRange | null;
		text: string;
	},
): SelectionTarget {
	const { blockId, range, text } = options;
	const start = range?.start ?? 0;
	const end = range?.end ?? start;
	const ops: DocumentOp[] = [];

	if (end > start) {
		ops.push({
			type: "delete-text",
			blockId,
			offset: start,
			length: end - start,
		});
	}

	if (text.length > 0) {
		ops.push({
			type: "insert-text",
			blockId,
			offset: start,
			text,
		});
	}

	if (ops.length > 0) {
		editor.apply(ops, { origin: "user" });
	}

	const nextOffset = start + text.length;
	return {
		blockId,
		anchorOffset: nextOffset,
		focusOffset: nextOffset,
	};
}

export function applyListInputRule(
	editor: Editor,
	options: {
		blockId: string;
		range: SelectionRange | null;
		text: string;
	},
): SelectionTarget | null {
	const { blockId, range, text } = options;
	if (!range || range.start !== range.end) {
		return null;
	}

	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}

	const inputRuleEngine =
		editor.internals.getSlot<BlockInputRuleEngine>(
			INPUT_RULES_ENGINE_SLOT_KEY,
		) ?? null;
	if (inputRuleEngine) {
		const ops = inputRuleEngine.tryMatch(editor, blockId, text, {
			offset: range.start,
		});
		if (ops) {
			editor.apply(ops, { origin: "input-rule" });
			return {
				blockId,
				anchorOffset: 0,
				focusOffset: 0,
			};
		}
	}

	if (block.type !== "paragraph") {
		return null;
	}

	const match = matchListInputRule(block.textContent(), range, text);
	if (!match) {
		return null;
	}

	editor.apply(
		[
			{
				type: "delete-text",
				blockId,
				offset: match.deleteRange.start,
				length: match.deleteRange.end - match.deleteRange.start,
			} as DocumentOp,
			{
				type: "convert-block",
				blockId,
				newType: match.blockType,
				newProps: match.newProps,
			} as DocumentOp,
		],
		{ origin: "input-rule" },
	);

	return {
		blockId,
		anchorOffset: 0,
		focusOffset: 0,
	};
}
