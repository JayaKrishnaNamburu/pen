import type { BlockHandle, CellSelection, TableBlockHandle } from "@input/pen-types";

export interface ResolvedCellSelectionCell {
	row: number;
	col: number;
	rowId: string | null;
	columnId: string | null;
}

export function hasIndexedCellSelectionMetadata(
	selection: CellSelection,
): boolean {
	return Array.isArray(selection.rowIds) && Array.isArray(selection.columnIds);
}

export function resolveCellSelectionCoord(
	block: BlockHandle,
	selection: CellSelection,
	coord: { row: number; col: number },
): ResolvedCellSelectionCell | null {
	if (!hasIndexedCellSelectionMetadata(selection)) {
		return {
			row: coord.row,
			col: coord.col,
			rowId: null,
			columnId: null,
		};
	}

	const rowId = selection.rowIds?.[coord.row] ?? null;
	const columnId = selection.columnIds?.[coord.col] ?? null;
	if (!rowId || !columnId) {
		return null;
	}

	const rowIndex = findRowIndexById(block, rowId);
	const columnIndex = findColumnIndexById(block, columnId);
	if (rowIndex < 0 || columnIndex < 0) {
		return null;
	}

	return {
		row: rowIndex,
		col: columnIndex,
		rowId,
		columnId,
	};
}

export function resolveCellSelectionMatrix(
	block: BlockHandle,
	selection: CellSelection,
): ResolvedCellSelectionCell[][] {
	if (!hasIndexedCellSelectionMetadata(selection)) {
		const minRow = Math.min(selection.anchor.row, selection.head.row);
		const maxRow = Math.max(selection.anchor.row, selection.head.row);
		const minCol = Math.min(selection.anchor.col, selection.head.col);
		const maxCol = Math.max(selection.anchor.col, selection.head.col);
		const matrix: ResolvedCellSelectionCell[][] = [];
		for (let row = minRow; row <= maxRow; row++) {
			const rowCells: ResolvedCellSelectionCell[] = [];
			for (let col = minCol; col <= maxCol; col++) {
				rowCells.push({
					row,
					col,
					rowId: null,
					columnId: null,
				});
			}
			matrix.push(rowCells);
		}
		return matrix;
	}

	const startRow = Math.min(selection.anchor.row, selection.head.row);
	const endRow = Math.max(selection.anchor.row, selection.head.row);
	const startCol = Math.min(selection.anchor.col, selection.head.col);
	const endCol = Math.max(selection.anchor.col, selection.head.col);
	const selectedRowIds = selection.rowIds?.slice(startRow, endRow + 1) ?? [];
	const selectedColumnIds =
		selection.columnIds?.slice(startCol, endCol + 1) ?? [];
	const rowIndexById = createRowIndexById(block);
	const columnIndexById = createColumnIndexById(block);

	return selectedRowIds.map((rowId) =>
		selectedColumnIds.flatMap((columnId) => {
			const row = rowIndexById.get(rowId);
			const col = columnIndexById.get(columnId);
			if (row == null || col == null) {
				return [];
			}
			return [
				{
					row,
					col,
					rowId,
					columnId,
				},
			];
		}),
	);
}

function createRowIndexById(block: BlockHandle): Map<string, number> {
	const table = asTable(block);
	const rowIndexById = new Map<string, number>();
	if (!table) {
		return rowIndexById;
	}
	for (let index = 0; index < table.tableRowCount(); index++) {
		const row = table.tableRow(index);
		if (row) {
			rowIndexById.set(row.id, index);
		}
	}
	return rowIndexById;
}

function createColumnIndexById(block: BlockHandle): Map<string, number> {
	const table = asTable(block);
	if (!table) {
		return new Map();
	}
	return new Map(
		table.tableColumns().map((column, index) => [column.id, index]),
	);
}

function findRowIndexById(block: BlockHandle, rowId: string): number {
	const table = asTable(block);
	if (!table) {
		return -1;
	}
	for (let index = 0; index < table.tableRowCount(); index++) {
		if (table.tableRow(index)?.id === rowId) {
			return index;
		}
	}
	return -1;
}

function findColumnIndexById(block: BlockHandle, columnId: string): number {
	return asTable(block)?.tableColumns().findIndex((column) => column.id === columnId) ?? -1;
}

function asTable(block: BlockHandle): TableBlockHandle | null {
	return block.as("table");
}
