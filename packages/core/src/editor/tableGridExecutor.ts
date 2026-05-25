import type {
	CRDTAdapter,
	DeleteTableCellTextOp,
	DeleteTableColumnOp,
	DeleteTableRowOp,
	DocumentOp,
	FormatTableCellTextOp,
	InsertTableCellTextOp,
	InsertTableColumnOp,
	InsertTableRowOp,
	TableColumnSchema,
	UpdateTableColumnsOp,
} from "@pen/types";
import { generateId } from "@pen/types";
import {
	type CRDTUnknownArray,
	type CRDTUnknownMap,
	getRowCells,
	getStringProp,
	getTableColumns,
	getTableContent,
	isCRDTMap,
} from "./crdtShapes";
import {
	captureTableRowSnapshot,
	createRecordMap,
	ensureCellContent,
	getCellContent,
	type TableRowSnapshot,
	writeCellDeltas,
} from "./tableGridCellHelpers";

const ZERO_WIDTH_SPACE = "\u200B";

export type TableCellDelta = {
	insert: string;
	attributes?: Record<string, unknown>;
};

export class TableGridExecutor {
	private readonly _adapter: CRDTAdapter;

	constructor(adapter: CRDTAdapter) {
		this._adapter = adapter;
	}

	execute(blockMap: CRDTUnknownMap, op: DocumentOp): string[] {
		const tableOp = op as { type: string; blockId: string };

		if (op.type === "update-table-columns") {
			this.setStructuredTableColumns(
				blockMap,
				(op as UpdateTableColumnsOp).columns,
			);
			return [tableOp.blockId];
		}

		const tableContent = getTableContent(blockMap);
		if (!tableContent) {
			return [];
		}

		switch (op.type) {
			case "insert-table-row": {
				const rowOp = op as InsertTableRowOp;
				const row = this.createTableRow(this.resolveGridColumnCount(blockMap));
				tableContent.insert(rowOp.index, [row]);
				break;
			}
			case "delete-table-row": {
				const rowOp = op as DeleteTableRowOp;
				if (rowOp.index < tableContent.length) {
					tableContent.delete(rowOp.index, 1);
				}
				break;
			}
			case "insert-table-column": {
				const colOp = op as InsertTableColumnOp;
				for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
					const row = tableContent.get(rowIndex);
					if (!row || !isCRDTMap(row)) {
						continue;
					}
					const cells = getRowCells(row);
					if (!cells) {
						continue;
					}
					cells.insert(colOp.index, [this.createTableCell()]);
				}
				break;
			}
			case "delete-table-column": {
				const colOp = op as DeleteTableColumnOp;
				for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
					const row = tableContent.get(rowIndex);
					if (!row || !isCRDTMap(row)) {
						continue;
					}
					const cells = getRowCells(row);
					if (!cells) {
						continue;
					}
					if (colOp.index < cells.length) {
						cells.delete(colOp.index, 1);
					}
				}
				break;
			}
			case "merge-table-cells":
			case "split-table-cell":
				break;
			case "insert-table-cell-text": {
				const cellOp = op as InsertTableCellTextOp;
				const content = ensureCellContent(
					tableContent.get(cellOp.row),
					cellOp.col,
					() => this.createTableCell(),
				);
				if (content && typeof content.insert === "function") {
					content.insert(cellOp.offset, cellOp.text);
				}
				break;
			}
			case "delete-table-cell-text": {
				const cellOp = op as DeleteTableCellTextOp;
				const content = getCellContent(
					tableContent.get(cellOp.row),
					cellOp.col,
				);
				if (content && typeof content.delete === "function") {
					content.delete(cellOp.offset, cellOp.length);
				}
				break;
			}
			case "format-table-cell-text": {
				const cellOp = op as FormatTableCellTextOp;
				const content = getCellContent(
					tableContent.get(cellOp.row),
					cellOp.col,
				);
				if (content && typeof content.format === "function") {
					content.format(cellOp.offset, cellOp.length, cellOp.marks);
				}
				break;
			}
		}

		return [tableOp.blockId];
	}

	seedTableBlock(
		blockMap: CRDTUnknownMap,
		options?: {
			rowCount?: number;
			colCount?: number;
			preservedInlineDeltas?: TableCellDelta[];
		},
	): void {
		if (blockMap.get("tableContent")) {
			return;
		}

		const rowCount = Math.max(1, options?.rowCount ?? 2);
		const colCount = Math.max(1, options?.colCount ?? 2);
		const tableContent = this._adapter.createArray() as CRDTUnknownArray<CRDTUnknownMap>;
		for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
			tableContent.insert(rowIndex, [this.createTableRow(colCount)]);
		}
		blockMap.set("tableContent", tableContent);

		const preservedInlineDeltas = options?.preservedInlineDeltas ?? [];
		if (preservedInlineDeltas.length > 0) {
			const firstRow = tableContent.get(0);
			if (firstRow && isCRDTMap(firstRow)) {
				this.writeDeltasToTableCell(firstRow, 0, preservedInlineDeltas);
			}
		}
	}

	createTableCell(): CRDTUnknownMap {
		const cell = this._adapter.createMap() as CRDTUnknownMap;
		cell.set("id", generateId());
		cell.set("content", this._adapter.createText());
		return cell;
	}

	createTableRow(colCount: number): CRDTUnknownMap {
		const row = this._adapter.createMap() as CRDTUnknownMap;
		row.set("id", generateId());
		const cells = this._adapter.createArray() as CRDTUnknownArray<CRDTUnknownMap>;
		for (let columnIndex = 0; columnIndex < colCount; columnIndex++) {
			cells.insert(columnIndex, [this.createTableCell()]);
		}
		row.set("cells", cells);
		return row;
	}

	writeDeltasToTableCell(
		row: CRDTUnknownMap,
		col: number,
		deltas: TableCellDelta[],
	): void {
		const content = getCellContent(row, col);
		if (!content) {
			return;
		}

		for (const delta of deltas) {
			content.insert(content.length, delta.insert, delta.attributes);
		}
	}

	readTableCellText(rowMap: CRDTUnknownMap, columnIndex: number): string {
		const content = getCellContent(rowMap, columnIndex);
		if (content && typeof content.toString === "function") {
			const text = content.toString();
			return text === ZERO_WIDTH_SPACE ? "" : text;
		}
		return "";
	}

	writePlainTextToTableCell(
		rowMap: CRDTUnknownMap,
		columnIndex: number,
		value: string,
	): void {
		const content = ensureCellContent(rowMap, columnIndex, () =>
			this.createTableCell(),
		);
		if (!content) {
			return;
		}

		const current =
			typeof content.toString === "function" ? content.toString() : "";
		if (typeof content.delete === "function" && current.length > 0) {
			content.delete(0, current.length);
		}
		if (typeof content.insert === "function" && value.length > 0) {
			content.insert(0, value);
		}
	}

	readRowValues(rowMap: CRDTUnknownMap): string[] {
		const cells = getRowCells(rowMap);
		const colCount = cells?.length ?? 0;
		const values: string[] = [];
		for (let columnIndex = 0; columnIndex < colCount; columnIndex++) {
			values.push(this.readTableCellText(rowMap, columnIndex));
		}
		return values;
	}

	writeRowValues(rowMap: CRDTUnknownMap, values: string[]): void {
		for (let columnIndex = 0; columnIndex < values.length; columnIndex++) {
			this.writePlainTextToTableCell(
				rowMap,
				columnIndex,
				values[columnIndex] ?? "",
			);
		}
	}

	cloneTableRow(
		sourceRow: CRDTUnknownMap,
		options?: {
			rowId?: string;
			preserveCellIds?: boolean;
		},
	): CRDTUnknownMap {
		const snapshot = this.captureTableRowSnapshot(sourceRow);
		const clonedRow = this.createTableRow(snapshot.cells.length);
		this.applyTableRowSnapshot(clonedRow, snapshot, {
			rowId: options?.rowId,
			preserveCellIds: options?.preserveCellIds,
		});
		return clonedRow;
	}

	moveTableRow(
		tableContent: CRDTUnknownArray<CRDTUnknownMap>,
		rowIndex: number,
		targetIndex: number,
	): boolean {
		const rowMap = tableContent.get(rowIndex);
		if (!rowMap || !isCRDTMap(rowMap)) {
			return false;
		}

		const nextIndex = Math.max(0, Math.min(targetIndex, tableContent.length - 1));
		if (nextIndex === rowIndex) {
			return true;
		}

		const movedRow = this.cloneTableRow(rowMap, {
			preserveCellIds: true,
		});
		tableContent.delete(rowIndex, 1);
		tableContent.insert(nextIndex, [movedRow]);
		return true;
	}

	captureTableRowSnapshot(sourceRow: CRDTUnknownMap): TableRowSnapshot {
		return captureTableRowSnapshot(sourceRow);
	}

	applyTableRowSnapshot(
		targetRow: CRDTUnknownMap,
		snapshot: TableRowSnapshot,
		options?: {
			rowId?: string;
			preserveCellIds?: boolean;
		},
	): void {
		const nextRowId = options?.rowId ?? snapshot.rowId;
		if (nextRowId) {
			targetRow.set("id", nextRowId);
		}

		const targetCells = getRowCells(targetRow);
		if (!targetCells) {
			return;
		}

		for (let columnIndex = 0; columnIndex < snapshot.cells.length; columnIndex++) {
			const targetCell = targetCells.get(columnIndex);
			const cellSnapshot = snapshot.cells[columnIndex];
			if (!targetCell || !cellSnapshot || !isCRDTMap(targetCell)) {
				continue;
			}

			if (options?.preserveCellIds && cellSnapshot.cellId) {
				targetCell.set("id", cellSnapshot.cellId);
			}

			writeCellDeltas(targetCell, cellSnapshot.deltas);
		}
	}

	resolveGridColumnCount(blockMap: CRDTUnknownMap): number {
		const tableColumns = getTableColumns(blockMap);
		if (tableColumns && tableColumns.length > 0) {
			return tableColumns.length;
		}
		const tableContent = getTableContent(blockMap);
		if (tableContent && tableContent.length > 0) {
			let maxColumnCount = 0;
			for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
				const row = tableContent.get(rowIndex);
				if (!row || !isCRDTMap(row)) {
					continue;
				}
				const cells = getRowCells(row);
				if (cells) {
					maxColumnCount = Math.max(maxColumnCount, cells.length);
				}
			}
			if (maxColumnCount > 0) {
				return maxColumnCount;
			}
		}
		return 1;
	}

	setStructuredTableColumns(
		blockMap: CRDTUnknownMap,
		columns: Array<TableColumnSchema | Record<string, unknown>>,
	): void {
		const tableColumns = this._adapter.createArray() as CRDTUnknownArray<CRDTUnknownMap>;
		tableColumns.insert(
			0,
			columns.map((column) => this.createTableColumnMap(column)),
		);
		blockMap.set("tableColumns", tableColumns);
	}

	createTableColumnMap(
		column: TableColumnSchema | Record<string, unknown>,
	): CRDTUnknownMap {
		const columnMap = this._adapter.createMap() as CRDTUnknownMap;
		for (const [key, value] of Object.entries(
			column as Record<string, unknown>,
		)) {
			if (value === undefined) {
				continue;
			}
			if (key === "options" && Array.isArray(value)) {
				const optionsArray =
					this._adapter.createArray() as CRDTUnknownArray<CRDTUnknownMap>;
				optionsArray.insert(
					0,
					value.map((option) =>
						createRecordMap(
							() => this._adapter.createMap() as CRDTUnknownMap,
							option as Record<string, unknown>,
						),
					),
				);
				columnMap.set(key, optionsArray);
				continue;
			}
			if (key === "format" && value && typeof value === "object") {
				columnMap.set(
					key,
					createRecordMap(
						() => this._adapter.createMap() as CRDTUnknownMap,
						value as Record<string, unknown>,
					),
				);
				continue;
			}
			columnMap.set(key, value);
		}
		return columnMap;
	}

	setColumnValue(columnMap: CRDTUnknownMap, key: string, value: unknown): void {
		if (key === "id") {
			return;
		}
		if (value === undefined || value === null) {
			columnMap.delete?.(key);
			return;
		}
		if (key === "options" && Array.isArray(value)) {
			const optionsArray =
				this._adapter.createArray() as CRDTUnknownArray<CRDTUnknownMap>;
			if (value.length > 0) {
				optionsArray.insert(
					0,
					value.map((option: unknown) =>
						createRecordMap(
							() => this._adapter.createMap() as CRDTUnknownMap,
							option as Record<string, unknown>,
						),
					),
				);
			}
			columnMap.set(key, optionsArray);
			return;
		}
		if (key === "format" && value && typeof value === "object") {
			columnMap.set(
				key,
				createRecordMap(
					() => this._adapter.createMap() as CRDTUnknownMap,
					value as Record<string, unknown>,
				),
			);
			return;
		}
		columnMap.set(key, value);
	}

	readColumnIds(tableColumns: CRDTUnknownArray<CRDTUnknownMap> | null): string[] {
		if (!tableColumns) {
			return [];
		}
		const ids: string[] = [];
		for (let index = 0; index < tableColumns.length; index++) {
			const column = tableColumns.get(index);
			if (!column || !isCRDTMap(column)) {
				continue;
			}
			const id = getStringProp(column, "id");
			if (id) {
				ids.push(id);
			}
		}
		return ids;
	}
}
