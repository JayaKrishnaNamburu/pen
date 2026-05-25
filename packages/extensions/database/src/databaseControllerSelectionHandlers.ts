import type React from "react";
import { DATA_ATTRS } from "@pen/react";
import type { CellSelection } from "@pen/types";
import type { DatabaseViewModelColumn, DatabaseViewModelRow } from "./types";
import { getNextRowPinningState } from "./utils/databaseRenderer";

type SelectionHandlerContext = Record<string, any>;

export function createDatabaseSelectionHandlers(context: SelectionHandlerContext) {
	const {
		allRows,
		allVisibleSelected,
		blockId,
		cellSelection,
		columns,
		editor,
		fieldEditor,
		fieldEditorActiveCell,
		isDataReadonly,
		rowSelection,
		setRowSelection,
		updateViewState,
		viewState,
		visibleRowIds,
		visibleRows,
		visibleSelectionColumnIds,
	} = context;

	function createDatabaseCellSelection(
		anchor: { row: number; col: number },
		head: { row: number; col: number } = anchor,
	): CellSelection {
		return {
			type: "cell",
			blockId,
			anchor,
			head,
			rowIds: visibleRowIds,
			columnIds: visibleSelectionColumnIds,
		};
	}

	function findVisibleCellCoordByIds(
		rowId: string | null,
		columnId: string | null,
	): { row: number; col: number } | null {
		if (!rowId || !columnId) {
			return null;
		}
		const row = visibleRows.findIndex((entry: DatabaseViewModelRow) => entry.id === rowId);
		const col = columns.findIndex((entry: DatabaseViewModelColumn) => entry.id === columnId);
		if (row < 0 || col < 0) {
			return null;
		}
		return { row, col };
	}

	function findVisibleCellCoordByStorage(
		row: number,
		col: number,
	): { row: number; col: number } | null {
		const rowIndex = visibleRows.findIndex(
			(entry: DatabaseViewModelRow) => entry.crdtRowIndex === row,
		);
		const colIndex = columns.findIndex(
			(entry: DatabaseViewModelColumn) => entry.columnIndex === col,
		);
		if (rowIndex < 0 || colIndex < 0) {
			return null;
		}
		return { row: rowIndex, col: colIndex };
	}

	function normalizeDatabaseCellSelection(
		selection: CellSelection,
	): CellSelection | null {
		if (columns.length === 0) {
			return null;
		}
		if (visibleRows.length === 0) {
			return {
				type: "cell",
				blockId,
				anchor: selection.anchor,
				head: selection.head,
			};
		}

		const firstVisibleCell = { row: 0, col: 0 };
		const anchorCoord =
			findVisibleCellCoordByIds(
				selection.rowIds?.[selection.anchor.row] ?? null,
				selection.columnIds?.[selection.anchor.col] ?? null,
			) ??
			findVisibleCellCoordByStorage(
				selection.anchor.row,
				selection.anchor.col,
			) ??
			firstVisibleCell;
		const headCoord =
			findVisibleCellCoordByIds(
				selection.rowIds?.[selection.head.row] ?? null,
				selection.columnIds?.[selection.head.col] ?? null,
			) ??
			findVisibleCellCoordByStorage(
				selection.head.row,
				selection.head.col,
			) ??
			anchorCoord;

		return createDatabaseCellSelection(anchorCoord, headCoord);
	}

	function areSelectionAxesEqual(
		left: string[] | undefined,
		right: string[],
	): boolean {
		if (!left || left.length !== right.length) {
			return false;
		}
		return left.every((value, index) => value === right[index]);
	}

	function isDatabaseSelectionCurrent(selection: CellSelection): boolean {
		if (visibleRows.length === 0) {
			return !selection.rowIds && !selection.columnIds;
		}

		return (
			areSelectionAxesEqual(selection.rowIds, visibleRowIds) &&
			areSelectionAxesEqual(selection.columnIds, visibleSelectionColumnIds)
		);
	}
	function handleCellMouseDown(
		event: React.MouseEvent<HTMLElement>,
		row: DatabaseViewModelRow,
		column: DatabaseViewModelColumn,
	) {
		if (!fieldEditor) return;
		const isEditing =
			fieldEditorActiveCell?.blockId === blockId
			&& fieldEditorActiveCell.row === row.crdtRowIndex
			&& fieldEditorActiveCell.col === column.columnIndex;
		if (isEditing) return;
		const nextCoord = findVisibleCellCoordByIds(row.id, column.id);
		if (!nextCoord) return;
		event.preventDefault();
		event.stopPropagation();
		event.nativeEvent.stopImmediatePropagation?.();
		const isSameSingleCellSelection =
			cellSelection &&
			cellSelection.anchor.row === nextCoord.row &&
			cellSelection.anchor.col === nextCoord.col &&
			cellSelection.head.row === nextCoord.row &&
			cellSelection.head.col === nextCoord.col;
		if (!event.shiftKey && isSameSingleCellSelection) {
			editor.selectBlock(blockId);
			return;
		}
		if (event.shiftKey && cellSelection) {
			editor.setSelection(
				createDatabaseCellSelection(cellSelection.anchor, nextCoord),
			);
			return;
		}
		editor.setSelection(createDatabaseCellSelection(nextCoord));
	}

	function handleCellDoubleClick(
		event: React.MouseEvent<HTMLElement>,
		row: DatabaseViewModelRow,
		column: DatabaseViewModelColumn,
	) {
		if (isDataReadonly || !fieldEditor) return;
		event.preventDefault();
		event.stopPropagation();
		event.nativeEvent.stopImmediatePropagation?.();
		const cellSurface = event.currentTarget.querySelector(`[${DATA_ATTRS.fieldEditorSurface}]`) as HTMLElement | null;
		if (cellSurface) {
			fieldEditor.activateCellFromElement?.(blockId, row.crdtRowIndex, column.columnIndex, cellSurface)
				?? fieldEditor.activateCell?.(blockId, row.crdtRowIndex, column.columnIndex);
			return;
		}
		fieldEditor.activateCell?.(blockId, row.crdtRowIndex, column.columnIndex);
	}
	function handleToggleAllRows() {
		if (allVisibleSelected) {
			const nextSelection = { ...rowSelection };
			for (const rowId of visibleRowIds) {
				delete nextSelection[rowId];
			}
			setRowSelection(nextSelection);
			return;
		}
		const nextSelection = { ...rowSelection };
		for (const rowId of visibleRowIds) {
			nextSelection[rowId] = true;
		}
		setRowSelection(nextSelection);
	}

	function handleToggleRow(rowId: string) {
		setRowSelection((previous: Record<string, boolean>) => ({
			...previous,
			[rowId]: !previous[rowId],
		}));
	}

	function getSelectedRowIds(
		fallback?: { rowId: string; checked: boolean },
	): string[] {
		const selectedRowIds = allRows
			.filter((row: DatabaseViewModelRow) => rowSelection[row.id])
			.map((row: DatabaseViewModelRow) => row.id);
		if (
			fallback?.checked &&
			!selectedRowIds.includes(fallback.rowId)
		) {
			selectedRowIds.push(fallback.rowId);
		}
		return selectedRowIds;
	}

	function handleRowSelectionKeyDown(
		event: React.KeyboardEvent<HTMLInputElement>,
		rowId: string,
	) {
		if (event.key !== "Backspace" && event.key !== "Delete") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		handleDeleteSelectedRows({
			rowId,
			checked: event.currentTarget.checked,
		});
	}

	function handleDeleteSelectedRows(
		fallback?: { rowId: string; checked: boolean },
	) {
		const selectedRowIds = getSelectedRowIds(fallback);
		if (selectedRowIds.length === 0 || isDataReadonly) return;
		editor.apply([
			{
				type: "database-delete-rows",
				blockId,
				rowIds: selectedRowIds,
			},
		], { origin: "user" });
		setRowSelection({});
	}

	function handlePinSelectedRows(target: "top" | "bottom" | "none") {
		const selectedRowIds = getSelectedRowIds();
		if (selectedRowIds.length === 0) {
			return;
		}
		const currentRowPinning = viewState.rowPinning;
		const nextRowPinning = getNextRowPinningState(
			currentRowPinning,
			selectedRowIds,
			target,
		);
		updateViewState({ rowPinning: nextRowPinning, pageIndex: 0 });
	}

	return {
		createDatabaseCellSelection,
		findVisibleCellCoordByIds,
		normalizeDatabaseCellSelection,
		isDatabaseSelectionCurrent,
		handleCellMouseDown,
		handleCellDoubleClick,
		handleToggleAllRows,
		handleToggleRow,
		getSelectedRowIds,
		handleRowSelectionKeyDown,
		handleDeleteSelectedRows,
		handlePinSelectedRows,
	};
}
