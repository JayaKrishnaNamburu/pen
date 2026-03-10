import type {
	DatabaseDeleteRowOp,
	DatabaseDeleteRowsOp,
	DatabaseDuplicateRowOp,
	DatabaseInsertRowOp,
	DatabaseMoveRowOp,
	DatabaseUpdateCellOp,
	DocumentOp,
	SelectOption,
} from "@pen/types";
import { normalizeDatabaseValueForType } from "@pen/types";
import {
	type TableContentArray,
	type CRDTUnknownMap,
	findColumnIndexById,
	findRowIndexById,
	getTableColumns,
	getTableContent,
	isCRDTMap,
} from "./crdtShapes";
import { TableGridExecutor } from "./tableGridExecutor";

type CRDTArrayLike = {
	length: number;
	get(index: number): unknown;
};

function isCRDTArrayLike(value: unknown): value is CRDTArrayLike {
	return (
		typeof value === "object" &&
		value !== null &&
		"length" in value &&
		typeof (value as { length?: unknown }).length === "number" &&
		typeof (value as { get?: unknown }).get === "function"
	);
}

export class DatabaseRowExecutor {
	private readonly _tableGrid: TableGridExecutor;

	constructor(tableGrid: TableGridExecutor) {
		this._tableGrid = tableGrid;
	}

	execute(blockMap: CRDTUnknownMap, op: DocumentOp): boolean {
		const tableContent = getTableContent(blockMap);
		if (!tableContent) {
			return false;
		}

		switch (op.type) {
			case "database-insert-row": {
				const insertOp = op as DatabaseInsertRowOp;
				if (insertOp.rowId && findRowIndexById(tableContent, insertOp.rowId) >= 0) {
					return false;
				}
				const rowIndex = Math.max(
					0,
					Math.min(
						typeof insertOp.index === "number"
							? insertOp.index
							: tableContent.length,
						tableContent.length,
					),
				);
				const row = this._tableGrid.createTableRow(
					this._tableGrid.resolveGridColumnCount(blockMap),
				);
				if (insertOp.rowId) {
					row.set("id", insertOp.rowId);
				}
				tableContent.insert(rowIndex, [row]);
				const insertedRow = tableContent.get(rowIndex);
				if (!insertedRow || !isCRDTMap(insertedRow)) {
					return true;
				}
				if (insertOp.values) {
					for (const [columnId, value] of Object.entries(insertOp.values)) {
						const columnIndex = findColumnIndexById(blockMap, columnId);
						if (columnIndex >= 0) {
							const normalizedValue = this._normalizeCellValue(
								blockMap,
								columnId,
								value,
							);
							if (normalizedValue == null) {
								continue;
							}
							this._tableGrid.writePlainTextToTableCell(
								insertedRow,
								columnIndex,
								normalizedValue,
							);
						}
					}
				}
				return true;
			}
			case "database-update-cell": {
				const cellOp = op as DatabaseUpdateCellOp;
			const rowIndex = findRowIndexById(tableContent, cellOp.rowId);
			const columnIndex = findColumnIndexById(
				blockMap,
				cellOp.columnId,
			);
				if (rowIndex < 0 || columnIndex < 0) {
					return false;
				}
				const rowMap = tableContent.get(rowIndex);
				if (!rowMap || !isCRDTMap(rowMap)) {
					return false;
				}
				const normalizedValue = this._normalizeCellValue(
					blockMap,
					cellOp.columnId,
					cellOp.value,
				);
				if (normalizedValue == null) {
					return false;
				}
				this._tableGrid.writePlainTextToTableCell(
					rowMap,
					columnIndex,
					normalizedValue,
				);
				return true;
			}
			case "database-delete-row": {
				const deleteOp = op as DatabaseDeleteRowOp;
			const rowIndex = findRowIndexById(tableContent, deleteOp.rowId);
			if (rowIndex < 0) {
				return false;
			}
			tableContent.delete(rowIndex, 1);
			return true;
		}
		case "database-delete-rows": {
			const deleteOp = op as DatabaseDeleteRowsOp;
			const rowIndexes = deleteOp.rowIds
				.map((rowId) => findRowIndexById(tableContent, rowId))
					.filter((index): index is number => index >= 0)
					.sort((left, right) => right - left);
				for (const rowIndex of rowIndexes) {
					tableContent.delete(rowIndex, 1);
				}
				return rowIndexes.length > 0;
			}
			case "database-duplicate-row": {
				const duplicateOp = op as DatabaseDuplicateRowOp;
			if (duplicateOp.newRowId && findRowIndexById(tableContent, duplicateOp.newRowId) >= 0) {
				return false;
			}
			const rowIndex = findRowIndexById(
				tableContent,
				duplicateOp.rowId,
			);
				if (rowIndex < 0) {
					return false;
				}
				const sourceRow = tableContent.get(rowIndex);
				if (!sourceRow || !isCRDTMap(sourceRow)) {
					return false;
				}
				const snapshot = this._tableGrid.captureTableRowSnapshot(sourceRow);
				const nextRow = this._tableGrid.createTableRow(snapshot.cells.length);
				tableContent.insert(rowIndex + 1, [nextRow]);
				const insertedRow = tableContent.get(rowIndex + 1);
				if (!insertedRow || !isCRDTMap(insertedRow)) {
					return false;
				}
				this._tableGrid.applyTableRowSnapshot(insertedRow, snapshot, {
					rowId: duplicateOp.newRowId,
				});
				return true;
			}
			case "database-move-row": {
				// Preserve collaboration safety until we have a true move that keeps
				// the existing shared row object intact.
				return false;
			}
		default:
			return false;
		}
	}

	private _normalizeCellValue(
		blockMap: CRDTUnknownMap,
		columnId: string,
		value: string,
	): string | null {
		const tableColumns = getTableColumns(blockMap);
		if (!tableColumns) {
			return value;
		}
		const columnIndex = findColumnIndexById(blockMap, columnId);
		if (columnIndex < 0) {
			return null;
		}
		const columnMap = tableColumns.get(columnIndex);
		if (!columnMap || !isCRDTMap(columnMap)) {
			return null;
		}
		const columnType = columnMap.get("type");
		if (typeof columnType !== "string") {
			return value;
		}
		return normalizeDatabaseValueForType(
			value,
			columnType,
			this._readColumnOptions(columnMap),
		);
	}

	private _readColumnOptions(columnMap: CRDTUnknownMap): SelectOption[] {
		const rawOptions = columnMap.get("options");
		if (!isCRDTArrayLike(rawOptions)) {
			return [];
		}
		const options: SelectOption[] = [];
		for (let index = 0; index < rawOptions.length; index++) {
			const optionMap = rawOptions.get(index);
			if (!optionMap || !isCRDTMap(optionMap)) {
				continue;
			}
			const id = optionMap.get("id");
			const optionValue = optionMap.get("value");
			if (typeof id !== "string" || typeof optionValue !== "string") {
				continue;
			}
			const color = optionMap.get("color");
			const label = optionMap.get("label");
			options.push({
				id,
				value: optionValue,
				color: typeof color === "string" ? color : undefined,
				label: typeof label === "string" ? label : undefined,
			});
		}
		return options;
	}
}
