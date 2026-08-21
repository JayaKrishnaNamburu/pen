import type {
	CellSelection,
	CommandResult,
	Editor,
	FacetProvider,
	SelectionState,
} from "@input/pen-types";

import { commandHandler, defineCommand } from "./define";
import {
	blockSelectionResult,
	collapsedAt,
	getAdjacentVisibleBlockId,
	getBlockInputMode,
	isEditableTextBlock,
} from "./helpers";

export const tableCellNext = defineCommand("table.cellNext");
export const tableCellPrev = defineCommand("table.cellPrev");
export const tableCellDown = defineCommand("table.cellDown");
export const tableEscapeGrid = defineCommand("table.escapeGrid");

export function tableCommandHandlers(): FacetProvider[] {
	return [
		commandHandler(tableCellNext, (editor) => handleCellStep(editor, 1)),
		commandHandler(tableCellPrev, (editor) => handleCellStep(editor, -1)),
		commandHandler(tableCellDown, handleCellDown),
		commandHandler(tableEscapeGrid, handleEscapeGrid),
	];
}

function handleCellStep(
	editor: Editor,
	direction: 1 | -1,
): CommandResult | false {
	const current = readCellContext(editor);
	if (!current) {
		return false;
	}

	const linear = current.head.row * current.colCount + current.head.col;
	const lastIndex = current.rowCount * current.colCount - 1;
	const nextIndex = Math.max(0, Math.min(lastIndex, linear + direction));
	const row = Math.floor(nextIndex / current.colCount);
	const col = nextIndex % current.colCount;
	return { selection: cellSelectionResult(current.blockId, { row, col }) };
}

function handleCellDown(editor: Editor): CommandResult | false {
	const current = readCellContext(editor);
	if (!current) {
		return false;
	}

	const row = Math.min(current.head.row + 1, current.rowCount - 1);
	return {
		selection: cellSelectionResult(current.blockId, {
			row,
			col: current.head.col,
		}),
	};
}

function handleEscapeGrid(editor: Editor): CommandResult | false {
	const current = readCellContext(editor);
	if (!current) {
		return false;
	}

	const nextId = getAdjacentVisibleBlockId(editor, current.blockId, "next");
	const previousId = getAdjacentVisibleBlockId(
		editor,
		current.blockId,
		"previous",
	);
	const targetId = nextId ?? previousId;
	if (!targetId) {
		return { selection: blockSelectionResult([current.blockId]) };
	}
	return {
		selection: selectionOutsideTable(
			editor,
			targetId,
			nextId ? "start" : "end",
		),
	};
}

function readCellContext(editor: Editor): {
	blockId: string;
	head: { row: number; col: number };
	rowCount: number;
	colCount: number;
} | null {
	const selection = editor.selection;
	if (!selection || selection.type !== "cell") {
		return null;
	}

	const table = editor.getBlock(selection.blockId)?.as("table");
	const rowCount =
		selection.rowIds?.length ?? table?.tableRowCount() ?? 0;
	const colCount =
		selection.columnIds?.length ?? table?.tableColumnCount() ?? 0;
	if (rowCount <= 0 || colCount <= 0) {
		return null;
	}

	return {
		blockId: selection.blockId,
		head: selection.head,
		rowCount,
		colCount,
	};
}

function cellSelectionResult(
	blockId: string,
	coord: { row: number; col: number },
	head: { row: number; col: number } = coord,
): SelectionState {
	const selection: CellSelection = {
		type: "cell",
		blockId,
		anchor: coord,
		head,
	};
	return selection;
}

function selectionOutsideTable(
	editor: Editor,
	blockId: string,
	edge: "start" | "end",
): SelectionState {
	if (getBlockInputMode(editor, blockId) === "table") {
		const table = editor.getBlock(blockId)?.as("table");
		const lastRow = Math.max((table?.tableRowCount() ?? 1) - 1, 0);
		const lastCol = Math.max((table?.tableColumnCount() ?? 1) - 1, 0);
		const coord =
			edge === "end" ? { row: lastRow, col: lastCol } : { row: 0, col: 0 };
		return cellSelectionResult(blockId, coord);
	}
	if (isEditableTextBlock(editor, blockId)) {
		const block = editor.getBlock(blockId);
		return collapsedAt(
			blockId,
			edge === "end" ? (block?.length() ?? 0) : 0,
		);
	}
	return blockSelectionResult([blockId]);
}
