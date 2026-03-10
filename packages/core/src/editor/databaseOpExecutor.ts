import type {
	CRDTAdapter,
	DocumentOp,
	DatabaseAddColumnOp,
	DatabaseUpdateColumnOp,
	DatabaseConvertColumnOp,
	DatabaseRemoveColumnOp,
	DatabaseInsertRowOp,
	DatabaseUpdateCellOp,
	DatabaseDeleteRowOp,
	DatabaseDeleteRowsOp,
	DatabaseDuplicateRowOp,
	DatabaseMoveRowOp,
	DatabaseAddViewOp,
	DatabaseUpdateViewOp,
	DatabaseRemoveViewOp,
	DatabaseSetActiveViewOp,
	DatabaseUpdateSelectOptionsOp,
	TableColumnSchema,
} from "@pen/types";
import { coerceDatabaseValue } from "@pen/types";
import {
	type CRDTUnknownMap,
	type TableColumnArray,
	type TableContentArray,
	findColumnIndexById,
	findColumnMapById,
	getRowCells,
	getTableColumns,
	getTableContent,
	isCRDTMap,
} from "./crdtShapes";
import { DatabaseRowExecutor } from "./databaseRowExecutor";
import { DatabaseSelectOptionsExecutor } from "./databaseSelectOptionsExecutor";
import { DatabaseViewExecutor } from "./databaseViewExecutor";
import { TableGridExecutor } from "./tableGridExecutor";

export class DatabaseOpExecutor {
	private readonly _adapter: CRDTAdapter;
	private readonly _rows: DatabaseRowExecutor;
	private readonly _tableGrid: TableGridExecutor;
	private readonly _selectOptions: DatabaseSelectOptionsExecutor;
	private readonly _views: DatabaseViewExecutor;

	constructor(adapter: CRDTAdapter, tableGrid: TableGridExecutor) {
		this._adapter = adapter;
		this._rows = new DatabaseRowExecutor(tableGrid);
		this._tableGrid = tableGrid;
		this._selectOptions = new DatabaseSelectOptionsExecutor(adapter, tableGrid);
		this._views = new DatabaseViewExecutor(adapter, tableGrid);
	}

	execute(blockMap: CRDTUnknownMap, op: DocumentOp): string[] {
		const databaseOp = op as { type: string; blockId: string };
		this.seedDatabaseBlock(blockMap);
		const tableContent = getTableContent(blockMap);
		const tableColumns = getTableColumns(blockMap);

		switch (op.type) {
			case "database-add-column": {
				const addOp = op as DatabaseAddColumnOp;
				if (!tableContent || !tableColumns) {
					return [];
				}
				const nextIndex = Math.max(
					0,
					Math.min(
						typeof addOp.index === "number" ? addOp.index : tableColumns.length,
						tableColumns.length,
					),
				);
				for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
					const rowMap = tableContent.get(rowIndex);
					if (!rowMap || !isCRDTMap(rowMap)) {
						continue;
					}
					const cells = getRowCells(rowMap);
					if (cells) {
						cells.insert(nextIndex, [this._tableGrid.createTableCell()]);
					}
				}
				tableColumns.insert(nextIndex, [
					this._tableGrid.createTableColumnMap(
						addOp.column as unknown as Record<string, unknown>,
					),
				]);
				this._views.insertColumnIntoViews(
					blockMap,
					addOp.column.id,
					nextIndex,
					addOp.viewId,
				);
				return [databaseOp.blockId];
			}
			case "database-update-column": {
				const updateOp = op as DatabaseUpdateColumnOp;
				const columnMap = findColumnMapById(
					blockMap,
					updateOp.columnId,
				);
				if (!columnMap) return [];
				const patchEntries = Object.entries(updateOp.patch).filter(
					([key]) => key !== "type",
				);
				if (patchEntries.length === 0) {
					return [];
				}
				for (const [key, value] of patchEntries) {
					this._tableGrid.setColumnValue(columnMap, key, value);
				}
				return [databaseOp.blockId];
			}
			case "database-convert-column": {
				const convertOp = op as DatabaseConvertColumnOp;
				if (!tableContent || !tableColumns) {
					return [];
				}
				const columnIndex = findColumnIndexById(
					blockMap,
					convertOp.columnId,
				);
				if (columnIndex < 0) return [];
				const columnMap = tableColumns.get(columnIndex);
				if (!columnMap || !isCRDTMap(columnMap)) {
					return [];
				}
				const fromType = columnMap.get("type");
				if (typeof fromType !== "string" || fromType === convertOp.toType) {
					return [];
				}
				for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
					const rowMap = tableContent.get(rowIndex);
					if (!rowMap || !isCRDTMap(rowMap)) {
						continue;
					}
					const raw = this._tableGrid.readTableCellText(rowMap, columnIndex);
					const coerced = coerceDatabaseValue(
						raw,
						fromType,
						convertOp.toType,
						this._selectOptions.readColumnOptions(columnMap),
					);
					this._tableGrid.writePlainTextToTableCell(
						rowMap,
						columnIndex,
						coerced,
					);
				}
				columnMap.set("type", convertOp.toType);
				if (
					convertOp.toType === "select" ||
					convertOp.toType === "multiSelect"
				) {
					this._selectOptions.ensureOptionsArray(columnMap);
				} else {
					columnMap.delete?.("options");
				}
				return [databaseOp.blockId];
			}
			case "database-remove-column": {
				const removeOp = op as DatabaseRemoveColumnOp;
				if (!tableContent || !tableColumns) {
					return [];
				}
				const columnIndex = findColumnIndexById(
					blockMap,
					removeOp.columnId,
				);
				if (columnIndex < 0) return [];
				for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
					const rowMap = tableContent.get(rowIndex);
					if (!rowMap || !isCRDTMap(rowMap)) {
						continue;
					}
					const cells = getRowCells(rowMap);
					if (cells && columnIndex < cells.length) {
						cells.delete(columnIndex, 1);
					}
				}
				tableColumns.delete(columnIndex, 1);
				this._views.removeColumnFromViews(blockMap, removeOp.columnId);
				return [databaseOp.blockId];
			}
			case "database-insert-row": {
				return this._rows.execute(blockMap, op) ? [databaseOp.blockId] : [];
			}
			case "database-update-cell": {
				return this._rows.execute(blockMap, op) ? [databaseOp.blockId] : [];
			}
			case "database-delete-row": {
				const deleteOp = op as DatabaseDeleteRowOp;
				const deleted = this._rows.execute(blockMap, op);
				if (!deleted) {
					return [];
				}
				this._views.removeRowsFromViews(blockMap, [deleteOp.rowId]);
				return [databaseOp.blockId];
			}
			case "database-delete-rows": {
				const deleteOp = op as DatabaseDeleteRowsOp;
				const deleted = this._rows.execute(blockMap, op);
				if (!deleted) {
					return [];
				}
				this._views.removeRowsFromViews(blockMap, deleteOp.rowIds);
				return [databaseOp.blockId];
			}
			case "database-duplicate-row": {
				return this._rows.execute(blockMap, op) ? [databaseOp.blockId] : [];
			}
			case "database-move-row": {
				return this._rows.execute(blockMap, op) ? [databaseOp.blockId] : [];
			}
			case "database-add-view": {
				const addViewOp = op as DatabaseAddViewOp;
				return this._views.addView(blockMap, addViewOp)
					? [databaseOp.blockId]
					: [];
			}
		case "database-update-view":
			return this._views.updateView(blockMap, op as DatabaseUpdateViewOp)
					? [databaseOp.blockId]
					: [];
			case "database-remove-view": {
				const removeViewOp = op as DatabaseRemoveViewOp;
				return this._views.removeView(blockMap, removeViewOp)
					? [databaseOp.blockId]
					: [];
			}
			case "database-set-active-view": {
				const setActiveViewOp = op as DatabaseSetActiveViewOp;
				return this._views.setActiveView(blockMap, setActiveViewOp)
					? [databaseOp.blockId]
					: [];
			}
			case "database-update-select-options": {
				const optionsOp = op as DatabaseUpdateSelectOptionsOp;
				const columnMap = findColumnMapById(
					blockMap,
					optionsOp.columnId,
				);
				if (!columnMap) return [];
				this._selectOptions.applyMutation(blockMap, columnMap, optionsOp);
				return [databaseOp.blockId];
			}
			default:
				return [];
		}
	}

	replaceColumns(
		blockMap: CRDTUnknownMap,
		columns: TableColumnSchema[],
	): boolean {
		this.seedDatabaseBlock(blockMap);
		this._tableGrid.setStructuredTableColumns(blockMap, columns);

		const tableContent = getTableContent(blockMap);
		if (tableContent) {
			for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
				const rowMap = tableContent.get(rowIndex);
				if (!rowMap || !isCRDTMap(rowMap)) {
					continue;
				}
				const cells = getRowCells(rowMap);
				if (!cells) {
					continue;
				}
				while (cells.length < columns.length) {
					cells.insert(cells.length, [this._tableGrid.createTableCell()]);
				}
				while (cells.length > columns.length) {
					cells.delete(cells.length - 1, 1);
				}
			}
		}

		this._views.resetColumns(
			blockMap,
			columns.map((column) => column.id),
		);
		return true;
	}

	seedDatabaseBlock(blockMap: CRDTUnknownMap): void {
		let tableContent = getTableContent(blockMap);
		if (!tableContent) {
			tableContent = this._adapter.createArray() as TableContentArray;
			blockMap.set("tableContent", tableContent);
		}

		let tableColumns = getTableColumns(blockMap);
		if (!tableColumns || typeof tableColumns.insert !== "function") {
			tableColumns = this._adapter.createArray() as TableColumnArray;
			blockMap.set("tableColumns", tableColumns);
		}
		if (tableColumns.length === 0) {
			const defaultColumns = [
				{ id: "name", title: "Name", type: "text" },
				{ id: "tags", title: "Tags", type: "select", options: [] },
				{ id: "status", title: "Done", type: "checkbox" },
			];
			tableColumns.insert(
				0,
				defaultColumns.map((column) => this._tableGrid.createTableColumnMap(column)),
			);
		}

		this._views.ensureViews(blockMap);
	}
}
