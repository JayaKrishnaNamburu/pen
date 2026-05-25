import type { TableColumnSchema } from "@pen/types";
import {
	type CRDTTextLike,
	type CRDTUnknownMap,
	getCellText,
	getRowCells,
	getStringProp,
	isCRDTMap,
} from "./crdtShapes";

export type CRDTDelta = {
	insert: string | Record<string, unknown>;
	attributes?: Record<string, unknown>;
};

export type TableRowSnapshot = {
	rowId?: string;
	cells: Array<{
		cellId?: string;
		deltas: CRDTDelta[];
	}>;
};

type CRDTTextWithDelta = CRDTTextLike & {
	toDelta?: () => CRDTDelta[];
	insertEmbed?: (offset: number, value: Record<string, unknown>) => void;
};

export function getCellContent(
	rowMap: CRDTUnknownMap,
	columnIndex: number,
): CRDTTextLike | null {
	return getCellText(rowMap, columnIndex);
}

export function ensureCellContent(
	rowMap: CRDTUnknownMap,
	columnIndex: number,
	createCell: () => CRDTUnknownMap,
): CRDTTextLike | null {
	const cells = getRowCells(rowMap);
	if (!cells || columnIndex < 0) {
		return null;
	}
	while (cells.length <= columnIndex) {
		cells.insert(cells.length, [createCell()]);
	}
	return getCellText(rowMap, columnIndex);
}

export function captureTableRowSnapshot(
	sourceRow: CRDTUnknownMap,
): TableRowSnapshot {
	const sourceCells = getRowCells(sourceRow);
	const snapshot: TableRowSnapshot = {
		rowId: getStringProp(sourceRow, "id"),
		cells: [],
	};
	if (!sourceCells) {
		return snapshot;
	}

	for (let columnIndex = 0; columnIndex < sourceCells.length; columnIndex++) {
		const sourceCell = sourceCells.get(columnIndex);
		if (!sourceCell || !isCRDTMap(sourceCell)) {
			snapshot.cells.push({ deltas: [] });
			continue;
		}
		snapshot.cells.push({
			cellId: getStringProp(sourceCell, "id"),
			deltas: readTableCellDeltas(sourceCell),
		});
	}

	return snapshot;
}

export function writeCellDeltas(
	cellMap: CRDTUnknownMap,
	deltas: CRDTDelta[],
): void {
	const targetContent = cellMap.get("content") as CRDTTextWithDelta | undefined;
	if (!targetContent) {
		return;
	}

	let offset = 0;
	for (const delta of deltas) {
		if (typeof delta.insert === "string") {
			if (delta.insert.length > 0) {
				targetContent.insert(offset, delta.insert, delta.attributes);
				offset += delta.insert.length;
			}
			continue;
		}

		if (typeof targetContent.insertEmbed === "function") {
			targetContent.insertEmbed(offset, delta.insert);
			if (delta.attributes) {
				targetContent.format(offset, 1, delta.attributes);
			}
			offset += 1;
		}
	}
}

export function readTableCellDeltas(cellMap: CRDTUnknownMap): CRDTDelta[] {
	const sourceContent = cellMap.get("content") as CRDTTextWithDelta | undefined;
	if (!sourceContent) {
		return [];
	}
	return typeof sourceContent.toDelta === "function"
		? sourceContent.toDelta()
		: [{ insert: sourceContent.toString() }];
}

export function createRecordMap(
	createMap: () => CRDTUnknownMap,
	record: TableColumnSchema | Record<string, unknown>,
): CRDTUnknownMap {
	const map = createMap();
	for (const [key, value] of Object.entries(record)) {
		if (value !== undefined) {
			map.set(key, value);
		}
	}
	return map;
}
