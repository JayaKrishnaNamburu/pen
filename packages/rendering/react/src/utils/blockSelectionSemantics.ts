import type { Editor } from "@pen/core";
import type { ExpandedBlockRole } from "../field-editor/crossBlock";

export type BlockSelectionRole = ExpandedBlockRole;

type BlockSchemaLike = {
	content?: string;
	fieldEditor?: unknown;
} | null | undefined;

export function getBlockSelectionRoleFromSchema(
	schema: BlockSchemaLike,
): BlockSelectionRole | null {
	if (!schema) {
		return null;
	}

	if (schema.fieldEditor === "none") {
		return "structural";
	}

	if (schema.content === "inline") {
		return "editable-inline";
	}

	return "delegated";
}

export function getBlockSelectionRoleFromType(
	blockType: string | null | undefined,
): BlockSelectionRole {
	if (blockType === "divider" || blockType === "image") {
		return "structural";
	}

	if (
		blockType === "codeBlock" ||
		blockType === "table" ||
		blockType === "database"
	) {
		return "delegated";
	}

	return "editable-inline";
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
		block.textContent().length,
	);
}

export function isInlineEditableBlock(
	editor: Editor,
	blockId: string,
): boolean {
	return getEditorBlockSelectionRole(editor, blockId) === "editable-inline";
}
