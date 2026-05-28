import type { BlockSelectionRole, Editor } from "@pen/types";
import {
	getBlockSelectionRoleFromSchema as getSharedBlockSelectionRoleFromSchema,
	getBlockSelectionRoleFromType as getSharedBlockSelectionRoleFromType,
} from "@pen/types";
export type { BlockSelectionRole } from "@pen/types";

const ZERO_WIDTH_SPACE = "\u200B";

export function getBlockSelectionRoleFromSchema(
	schema: Parameters<typeof getSharedBlockSelectionRoleFromSchema>[0],
): BlockSelectionRole | null {
	return getSharedBlockSelectionRoleFromSchema(schema);
}

export function getBlockSelectionRoleFromType(
	blockType: string | null | undefined,
): BlockSelectionRole {
	return getSharedBlockSelectionRoleFromType(blockType);
}

export function getEditorBlockSelectionRole(
	editor: Editor,
	blockId: string,
): BlockSelectionRole | null {
	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}

	return getBlockSelectionRoleFromSchema(editor.schema.resolve(block.type));
}

export function getSelectionLengthForRole(
	role: BlockSelectionRole | null,
	textLength: number,
): number {
	if (role && role !== "editable-inline") {
		return 1;
	}

	return textLength;
}

export function getEditorBlockSelectionLength(
	editor: Editor,
	blockId: string,
): number {
	const block = editor.getBlock(blockId);
	if (!block) {
		return 0;
	}

	return getSelectionLengthForRole(
		getEditorBlockSelectionRole(editor, blockId),
		getLogicalBlockTextLength(block),
	);
}

function getLogicalBlockTextLength(
	block: NonNullable<ReturnType<Editor["getBlock"]>>,
): number {
	return block
		.inlineDeltas()
		.reduce(
			(length, delta) =>
				length +
				(typeof delta.insert === "string"
					? delta.insert.replaceAll(ZERO_WIDTH_SPACE, "").length
					: 1),
			0,
		);
}

export function isInlineEditableBlock(
	editor: Editor,
	blockId: string,
): boolean {
	return getEditorBlockSelectionRole(editor, blockId) === "editable-inline";
}
