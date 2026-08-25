import { shouldExposeBlockInTooling } from "@input/pen-core";
import type { BlockSchema, Editor } from "@input/pen-types";
import { rejectToolCall } from "./toolRejection";

/**
 * Non-throwing form: the refusal reason, or `null` when the block is mutable.
 * Tools that return refusals to the model rather than throwing use this
 * (`spec-better-ai/01-edit-channel.md` EC5).
 */
export function checkToolCanMutateBlock(
	editor: Editor,
	blockId: string,
): string | null {
	const block = editor.getBlock(blockId);
	if (!block) {
		return `Unknown block: "${blockId}"`;
	}

	const schema = editor.schema.resolve(block.type);
	if (!schema) {
		return `Unknown block type: "${block.type}"`;
	}

	if (!shouldExposeBlockInTooling(editor.documentProfile, schema)) {
		return `Block "${blockId}" of type "${block.type}" is not editable in ${editor.documentProfile} documents.`;
	}

	return null;
}

export function assertToolCanMutateBlock(
	editor: Editor,
	blockId: string,
): BlockSchema {
	const reason = checkToolCanMutateBlock(editor, blockId);
	if (reason) {
		const block = editor.getBlock(blockId);
		rejectToolCall(
			editor,
			reason,
			block ? { blockId, blockType: block.type } : { blockId },
		);
	}

	const block = editor.getBlock(blockId);
	return editor.schema.resolve(block!.type)!;
}
