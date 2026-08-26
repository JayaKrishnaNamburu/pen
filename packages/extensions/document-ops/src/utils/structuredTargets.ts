import {
	getBlockSelectionRoleFromSchema,
	getFlowCapabilityFromSchema,
	shouldExposeBlockInTooling,
} from "@input/pen-core";
import type {
	StructuredTargetDescriptor,
	TargetEditability,
} from "@input/pen-content-ops";
import {
	isNestedContent,
	type BlockSchema,
	type BlockSelectionRole,
	type Editor,
	type FieldEditorType,
	type FlowBlockCapability,
} from "@input/pen-types";
import { getAvailableToolBlockSchemas } from "./blockTypePolicy";

const INLINE_CONTENT_TYPE = "inline";
const TABLE_BLOCK_TYPE = "table";

export const STRUCTURED_TARGET_OPERATION_IDS = [
	"replace_text",
	"insert_text",
	"append_text",
	"update_props",
	"insert_before",
	"insert_after",
	"insert_child_block",
	"move_block",
	"delete_block",
	"convert_block",
	"insert_row",
	"delete_row",
	"insert_column",
	"delete_column",
	"set_cell_text",
	"update_columns",
] as const;

export type StructuredTargetOperationId =
	(typeof STRUCTURED_TARGET_OPERATION_IDS)[number];

export interface StructuredTargetSchemaSnapshot {
	title: string | null;
	description: string | null;
	aliases: string[];
	content: string;
	fieldEditor: FieldEditorType | null;
	selectionRole: BlockSelectionRole | null;
	flowCapability: FlowBlockCapability | null;
	aiDescription: string | null;
}

export interface StructuredTargetInspection {
	blockId: string;
	target: StructuredTargetDescriptor;
	schema: StructuredTargetSchemaSnapshot | null;
	validOperations: StructuredTargetOperationId[];
}

export interface ToolBlockTypeEntry extends StructuredTargetSchemaSnapshot {
	type: string;
	props: string[];
	supportsChildren: boolean;
	editability: TargetEditability;
}

export function listAvailableToolBlockTypes(
	editor: Editor,
): ToolBlockTypeEntry[] {
	return getAvailableToolBlockSchemas(editor).map((schema) =>
		buildToolBlockTypeEntry(editor, schema),
	);
}

export function inspectStructuredTarget(
	editor: Editor,
	blockId?: string | null,
): StructuredTargetInspection | null {
	const resolvedBlockId = blockId ?? resolveSelectionBlockId(editor);
	if (!resolvedBlockId) {
		return null;
	}

	const block = editor.getBlock(resolvedBlockId);
	if (!block) {
		return null;
	}

	const schema = editor.schema.resolve(block.type);
	const target = buildStructuredTargetDescriptor(editor, block.id);
	if (!target) {
		return null;
	}

	return {
		blockId: block.id,
		target,
		schema: schema ? buildSchemaSnapshot(schema) : null,
		validOperations: listValidTargetOperations(target),
	};
}

export function listValidOperationsForTarget(
	editor: Editor,
	blockId?: string | null,
): StructuredTargetOperationId[] {
	return inspectStructuredTarget(editor, blockId)?.validOperations ?? [];
}

function buildStructuredTargetDescriptor(
	editor: Editor,
	blockId: string,
): StructuredTargetDescriptor | null {
	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}

	const schema = editor.schema.resolve(block.type);
	const editability = resolveTargetEditability(editor, schema);
	const flowCapability = getFlowCapabilityFromSchema(schema);

	if (block.type === TABLE_BLOCK_TYPE) {
		const table = block.as("table");
		return {
			kind: "table",
			blockId: block.id,
			blockType: block.type,
			documentProfile: editor.documentProfile,
			editability,
			rowCount: table?.tableRowCount() ?? 0,
			columnCount: table?.tableColumnCount() ?? 0,
			columns: [...(table?.tableColumns() ?? [])],
		};
	}

	return {
		kind: "block",
		blockId: block.id,
		blockType: block.type,
		documentProfile: editor.documentProfile,
		editability,
		flowCapability,
		supportsTextContent: schema?.content === INLINE_CONTENT_TYPE,
		supportsChildren: schema
			? isNestedContent(schema.content) || schema.isContainer === true
			: false,
		propSchemaKeys: Object.keys(schema?.propSchema ?? {}),
	};
}

function listValidTargetOperations(
	target: StructuredTargetDescriptor,
): StructuredTargetOperationId[] {
	if (target.editability !== "editable") {
		return [];
	}

	if (target.kind === "table") {
		return [
			"update_props",
			"insert_before",
			"insert_after",
			"move_block",
			"delete_block",
			"convert_block",
			"insert_row",
			"delete_row",
			"insert_column",
			"delete_column",
			"set_cell_text",
			"update_columns",
		];
	}

	const operations: StructuredTargetOperationId[] = [
		"update_props",
		"insert_before",
		"insert_after",
		"move_block",
		"delete_block",
		"convert_block",
	];

	if (target.supportsTextContent) {
		operations.unshift("append_text");
		operations.unshift("insert_text");
		operations.unshift("replace_text");
	}

	if (target.supportsChildren) {
		operations.push("insert_child_block");
	}

	return operations;
}

function buildToolBlockTypeEntry(
	editor: Editor,
	schema: BlockSchema,
): ToolBlockTypeEntry {
	const schemaSnapshot = buildSchemaSnapshot(schema);
	return {
		type: schema.type,
		props: Object.keys(schema.propSchema ?? {}),
		supportsChildren:
			isNestedContent(schema.content) || schema.isContainer === true,
		editability: resolveTargetEditability(editor, schema),
		...schemaSnapshot,
	};
}

function buildSchemaSnapshot(
	schema: BlockSchema,
): StructuredTargetSchemaSnapshot {
	return {
		title: schema.display?.title ?? null,
		description: schema.display?.description ?? null,
		aliases: [...(schema.display?.aliases ?? [])],
		content: Array.isArray(schema.content) ? "nested" : schema.content,
		fieldEditor: schema.fieldEditor ?? null,
		selectionRole: getBlockSelectionRoleFromSchema(schema),
		flowCapability: getFlowCapabilityFromSchema(schema),
		aiDescription: schema.aiDescription ?? null,
	};
}

function resolveTargetEditability(
	editor: Editor,
	schema: BlockSchema | null,
): TargetEditability {
	if (!schema) {
		return "unsupported";
	}

	return shouldExposeBlockInTooling(editor.documentProfile, schema)
		? "editable"
		: "read-only";
}

function resolveSelectionBlockId(editor: Editor): string | null {
	const selection = editor.getSelection();
	if (!selection) {
		return null;
	}
	if (selection.type === "text") {
		return selection.focus.blockId;
	}
	if (selection.type === "block") {
		return selection.blockIds[0] ?? null;
	}
	if (selection.type === "cell") {
		return selection.blockId;
	}
	return null;
}
