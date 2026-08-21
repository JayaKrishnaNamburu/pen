import { shouldExposeBlockInTooling } from "@input/pen-content-ops";
import type { BlockSchema, Editor } from "@input/pen-types";
import { rejectToolCall } from "./toolRejection";

export function assertToolCanMutateBlock(
	editor: Editor,
	blockId: string,
): BlockSchema {
	const block = editor.getBlock(blockId);
	if (!block) {
		rejectToolCall(editor, `Unknown block: "${blockId}"`, { blockId });
	}

	const schema = editor.schema.resolve(block.type);
	if (!schema) {
		rejectToolCall(editor, `Unknown block type: "${block.type}"`, {
			blockId,
			blockType: block.type,
		});
	}

	if (!shouldExposeBlockInTooling(editor.documentProfile, schema)) {
		rejectToolCall(
			editor,
			`Block "${blockId}" of type "${block.type}" is not editable in ${editor.documentProfile} documents.`,
			{ blockId, blockType: block.type },
		);
	}

	return schema;
}
