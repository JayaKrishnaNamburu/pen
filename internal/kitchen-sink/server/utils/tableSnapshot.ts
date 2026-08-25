import type { DocumentOp } from "@input/pen-types";
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
			type: "set-props",
			blockId,
			props: { columns: [...table.columns] },
		});
	}

	for (
		let index = currentShape.rowCount - 1;
		index >= table.rowCount;
		index -= 1
	) {
		ops.push({
			type: "grid",
			blockId,
			change: { kind: "delete-row", index },
		});
	}

	for (
		let index = currentShape.columnCount - 1;
		index >= table.columnCount;
		index -= 1
	) {
		ops.push({
			type: "grid",
			blockId,
			change: { kind: "delete-column", index },
		});
	}

	for (let index = currentShape.columnCount; index < table.columnCount; index += 1) {
		ops.push({
			type: "grid",
			blockId,
			change: { kind: "insert-column", index },
		});
	}

	for (let index = currentShape.rowCount; index < table.rowCount; index += 1) {
		ops.push({
			type: "grid",
			blockId,
			change: { kind: "insert-row", index },
		});
	}

	for (const row of table.rows) {
		for (const cell of row.cells) {
			if (!cell.text) {
				continue;
			}

			ops.push({
				type: "splice-text",
				blockId,
				cell: { row: cell.row, col: cell.col },
				from: 0,
				to: 0,
				insert: cell.text,
			});
		}
	}

	return ops;
}
