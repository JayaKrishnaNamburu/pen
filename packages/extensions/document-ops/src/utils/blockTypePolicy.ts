import { shouldExposeBlockInTooling } from "@input/pen-core";
import type { BlockSchema, Editor } from "@input/pen-types";
import { rejectToolCall } from "./toolRejection";

export function getAvailableToolBlockSchemas(editor: Editor): BlockSchema[] {
	return editor.schema
		.allBlocks()
		.filter((schema) =>
			shouldExposeBlockInTooling(editor.documentProfile, schema),
		);
}

/**
 * Non-throwing form: the refusal reason, or `null` when the type is usable.
 * Tools that return refusals to the model rather than throwing use this
 * (`spec-better-ai/01-edit-channel.md` EC5).
 */
export function checkToolCanUseBlockType(
	editor: Editor,
	blockType: string,
): string | null {
	const schema = editor.schema.resolve(blockType);
	if (!schema) {
		return `Unknown block type: "${blockType}"`;
	}

	if (!shouldExposeBlockInTooling(editor.documentProfile, schema)) {
		return `Block type "${blockType}" is not available in ${editor.documentProfile} documents.`;
	}

	return null;
}

export function assertToolCanUseBlockType(
	editor: Editor,
	blockType: string,
): BlockSchema {
	const reason = checkToolCanUseBlockType(editor, blockType);
	if (reason) {
		rejectToolCall(editor, reason, { blockType });
	}

	return editor.schema.resolve(blockType)!;
}
