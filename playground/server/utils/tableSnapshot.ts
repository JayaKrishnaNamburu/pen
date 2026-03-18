import type { DocumentOp } from "@pen/types";
import type { SerializedTableContent } from "./sessionSyncValidation";

interface TableShape {
	rowCount: number;
	columnCount: number;
}

export function buildTableSnapshotOps(
	blockId: string,
	table: SerializedTableContent,
	currentShape: TableShape,
): DocumentOp[] {
	const ops: DocumentOp[] = [];

	if (table.columns.length > 0) {
		ops.push({
			type: "update-table-columns",
			blockId,
			columns: [...table.columns],
		});
	}

	for (
		let index = currentShape.rowCount - 1;
		index >= table.rowCount;
		index -= 1
	) {
		ops.push({
			type: "delete-table-row",
			blockId,
			index,
		});
	}

	for (
		let index = currentShape.columnCount - 1;
		index >= table.columnCount;
		index -= 1
	) {
		ops.push({
			type: "delete-table-column",
			blockId,
			index,
		});
	}

	for (let index = currentShape.columnCount; index < table.columnCount; index += 1) {
		ops.push({
			type: "insert-table-column",
			blockId,
			index,
		});
	}

	for (let index = currentShape.rowCount; index < table.rowCount; index += 1) {
		ops.push({
			type: "insert-table-row",
			blockId,
			index,
		});
	}

	for (const row of table.rows) {
		for (const cell of row.cells) {
			if (!cell.text) {
				continue;
			}

			ops.push({
				type: "insert-table-cell-text",
				blockId,
				row: cell.row,
				col: cell.col,
				offset: 0,
				text: cell.text,
			});
		}
	}

	return ops;
}
