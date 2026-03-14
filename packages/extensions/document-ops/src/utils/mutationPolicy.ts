import type { BlockSchema, Editor } from "@pen/types";
import { shouldExposeBlockInTooling } from "@pen/types";

export function assertToolCanMutateBlock(
	editor: Editor,
	blockId: string,
): BlockSchema {
	const block = editor.getBlock(blockId);
	if (!block) {
		throw new Error(`Unknown block: "${blockId}"`);
	}

	const schema = editor.schema.resolve(block.type);
	if (!schema) {
		throw new Error(`Unknown block type: "${block.type}"`);
	}

	if (!shouldExposeBlockInTooling(editor.documentProfile, schema)) {
		throw new Error(
			`Block "${blockId}" of type "${block.type}" is not editable in ${editor.documentProfile} documents.`,
		);
	}

	return schema;
}
