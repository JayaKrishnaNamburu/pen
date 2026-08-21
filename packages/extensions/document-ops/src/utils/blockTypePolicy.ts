import { shouldExposeBlockInTooling } from "@input/pen-content-ops";
import type { BlockSchema, Editor } from "@input/pen-types";
import { rejectToolCall } from "./toolRejection";

export function getAvailableToolBlockSchemas(editor: Editor): BlockSchema[] {
	return editor.schema
		.allBlocks()
		.filter((schema) =>
			shouldExposeBlockInTooling(editor.documentProfile, schema),
		);
}

export function assertToolCanUseBlockType(
	editor: Editor,
	blockType: string,
): BlockSchema {
	const schema = editor.schema.resolve(blockType);
	if (!schema) {
		rejectToolCall(editor, `Unknown block type: "${blockType}"`, { blockType });
	}

	if (!shouldExposeBlockInTooling(editor.documentProfile, schema)) {
		rejectToolCall(
			editor,
			`Block type "${blockType}" is not available in ${editor.documentProfile} documents.`,
			{ blockType },
		);
	}

	return schema;
}
