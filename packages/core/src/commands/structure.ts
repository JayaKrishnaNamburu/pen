import type {
	BlockHandle,
	CommandResult,
	DocumentOp,
	Editor,
	FacetProvider,
	InlineDelta,
	SelectionState,
} from "@input/pen-types";
import { generateId } from "@input/pen-types";

import { commandHandler, defineCommand } from "./define";
import {
	blockSelectionResult,
	collapsedAt,
	getAdjacentVisibleBlockId,
	isEditableTextBlock,
	readTextFocus,
} from "./helpers";

export interface StructureBlockParam {
	readonly blockId?: string;
}

export const moveBlockUp = defineCommand<StructureBlockParam>("pen.moveBlockUp");
export const moveBlockDown =
	defineCommand<StructureBlockParam>("pen.moveBlockDown");
export const duplicateBlock =
	defineCommand<StructureBlockParam>("pen.duplicateBlock");
export const deleteBlock = defineCommand<StructureBlockParam>("pen.deleteBlock");

export function structureCommandHandlers(): FacetProvider[] {
	return [
		commandHandler(moveBlockUp, (editor, param) =>
			handleMoveBlock(editor, param, "up"),
		),
		commandHandler(moveBlockDown, (editor, param) =>
			handleMoveBlock(editor, param, "down"),
		),
		commandHandler(duplicateBlock, handleDuplicateBlock),
		commandHandler(deleteBlock, handleDeleteBlock),
	];
}

function handleMoveBlock(
	editor: Editor,
	param: StructureBlockParam,
	direction: "up" | "down",
): CommandResult | false {
	const blockId = resolveTargetBlockId(editor, param);
	if (!blockId || !editor.getBlock(blockId)) {
		return false;
	}

	const siblings = siblingBlockIds(editor, blockId);
	const index = siblings.indexOf(blockId);
	if (index < 0) {
		return false;
	}

	const swapId =
		direction === "up" ? siblings[index - 1] : siblings[index + 1];
	if (!swapId) {
		return false;
	}

	editor.apply(
		[
			{
				type: "move-block",
				blockId,
				position:
					direction === "up" ? { before: swapId } : { after: swapId },
			},
		],
		{ origin: "user" },
	);
	return { selection: selectionOnMovedBlock(editor, blockId) };
}

function handleDuplicateBlock(
	editor: Editor,
	param: StructureBlockParam,
): CommandResult | false {
	const blockId = resolveTargetBlockId(editor, param);
	const block = blockId ? editor.getBlock(blockId) : null;
	if (!block) {
		return false;
	}

	const newBlockId = generateId();
	const ops: DocumentOp[] = [
		{
			type: "insert-block",
			blockId: newBlockId,
			blockType: block.type,
			props: { ...block.props },
			position: { after: block.id },
		},
		...cloneInlineOps(block, newBlockId),
		...cloneTableOps(block, newBlockId),
	];
	editor.apply(ops, { origin: "user" });
	return { selection: selectionOnNewBlock(editor, newBlockId) };
}

function handleDeleteBlock(
	editor: Editor,
	param: StructureBlockParam,
): CommandResult | false {
	const blockIds = resolveTargetBlockIds(editor, param);
	if (blockIds.length === 0) {
		return false;
	}
	for (const blockId of blockIds) {
		if (!editor.getBlock(blockId)) {
			return false;
		}
	}

	const firstId = blockIds[0]!;
	const lastId = blockIds[blockIds.length - 1]!;
	const previousId = getAdjacentVisibleBlockId(editor, firstId, "previous");
	const nextId = getAdjacentVisibleBlockId(editor, lastId, "next");
	const remaining = editor.documentState.blockOrder.filter(
		(blockId) => !blockIds.includes(blockId),
	);

	if (remaining.length === 0) {
		const replacementId = generateId();
		editor.apply(
			[
				{
					type: "insert-block",
					blockId: replacementId,
					blockType: "paragraph",
					props: {},
					position: "last",
				},
				...blockIds.map((blockId) => ({
					type: "delete-block" as const,
					blockId,
				})),
			],
			{ origin: "user" },
		);
		return { selection: collapsedAt(replacementId, 0) };
	}

	editor.apply(
		blockIds.map((blockId) => ({ type: "delete-block" as const, blockId })),
		{ origin: "user" },
	);
	return selectionAfterDelete(editor, previousId, nextId);
}

function resolveTargetBlockId(
	editor: Editor,
	param: StructureBlockParam,
): string | null {
	if (param.blockId) {
		return param.blockId;
	}
	const ids = targetBlockIdsFromSelection(editor);
	return ids[0] ?? null;
}

function resolveTargetBlockIds(
	editor: Editor,
	param: StructureBlockParam,
): string[] {
	if (param.blockId) {
		return [param.blockId];
	}
	return targetBlockIdsFromSelection(editor);
}

function targetBlockIdsFromSelection(editor: Editor): string[] {
	const selection = editor.selection;
	if (!selection) {
		return [];
	}
	switch (selection.type) {
		case "text":
			return [selection.focus.blockId];
		case "block":
			return [...selection.blockIds];
		case "cell":
			return [selection.blockId];
		case "app":
			return [];
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}

function siblingBlockIds(editor: Editor, blockId: string): string[] {
	const parentId = editor.documentState.parentOf(blockId);
	return editor.documentState.blockOrder.filter(
		(id) => editor.documentState.parentOf(id) === parentId,
	);
}

function selectionOnMovedBlock(
	editor: Editor,
	blockId: string,
): SelectionState {
	const selection = editor.selection;
	if (selection?.type === "text" && selection.focus.blockId === blockId) {
		const focus = readTextFocus(editor);
		if (focus) {
			return collapsedAt(blockId, focus.offset);
		}
	}
	if (selection?.type === "cell" && selection.blockId === blockId) {
		return selection;
	}
	if (isEditableTextBlock(editor, blockId)) {
		const focus = readTextFocus(editor);
		return collapsedAt(blockId, focus?.offset ?? 0);
	}
	return blockSelectionResult([blockId]);
}

function selectionOnNewBlock(editor: Editor, blockId: string): SelectionState {
	if (isEditableTextBlock(editor, blockId)) {
		return collapsedAt(blockId, 0);
	}
	return blockSelectionResult([blockId]);
}

function selectionAfterDelete(
	editor: Editor,
	previousId: string | null,
	nextId: string | null,
): CommandResult {
	const fallbackId = previousId ?? nextId;
	if (!fallbackId || !editor.getBlock(fallbackId)) {
		return true;
	}
	if (isEditableTextBlock(editor, fallbackId)) {
		const fallback = editor.getBlock(fallbackId);
		const offset = previousId === fallbackId ? (fallback?.length() ?? 0) : 0;
		return { selection: collapsedAt(fallbackId, offset) };
	}
	return { selection: blockSelectionResult([fallbackId]) };
}

function cloneInlineOps(
	block: BlockHandle,
	newBlockId: string,
): DocumentOp[] {
	const ops: DocumentOp[] = [];
	let offset = 0;
	for (const delta of block.inlineDeltas()) {
		const written = cloneInlineDelta(delta, newBlockId, offset);
		if (!written) {
			continue;
		}
		ops.push(written.op);
		offset += written.length;
	}
	return ops;
}

function cloneInlineDelta(
	delta: InlineDelta,
	newBlockId: string,
	offset: number,
): { op: DocumentOp; length: number } | null {
	if (typeof delta.insert === "string") {
		if (delta.insert.length === 0) {
			return null;
		}
		return {
			op: {
				type: "insert-text",
				blockId: newBlockId,
				offset,
				text: delta.insert,
				...(delta.attributes ? { marks: delta.attributes } : {}),
			},
			length: delta.insert.length,
		};
	}
	return {
		op: {
			type: "insert-inline-node",
			blockId: newBlockId,
			offset,
			nodeType: delta.insert.type,
			props: { ...delta.insert.props },
		},
		length: 1,
	};
}

function cloneTableOps(block: BlockHandle, newBlockId: string): DocumentOp[] {
	const table = block.as("table");
	if (!table) {
		return [];
	}

	const rowCount = table.tableRowCount();
	const colCount = table.tableColumnCount();
	const ops: DocumentOp[] = [];
	for (let row = 2; row < rowCount; row += 1) {
		ops.push({
			type: "insert-table-row",
			blockId: newBlockId,
			index: row,
		});
	}
	for (let col = 2; col < colCount; col += 1) {
		ops.push({
			type: "insert-table-column",
			blockId: newBlockId,
			index: col,
		});
	}
	for (let row = 0; row < rowCount; row += 1) {
		for (let col = 0; col < colCount; col += 1) {
			const text = table.tableCell(row, col)?.textContent() ?? "";
			if (text.length === 0) {
				continue;
			}
			ops.push({
				type: "insert-table-cell-text",
				blockId: newBlockId,
				row,
				col,
				offset: 0,
				text,
			});
		}
	}
	return ops;
}
