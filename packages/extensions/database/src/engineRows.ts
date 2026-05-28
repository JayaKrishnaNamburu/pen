import {
	parseDatabaseMultiSelectValue,
	resolveStoredSelectOption,
} from "@pen/types";
import type { DatabaseEngine } from "./engineCore";
import { DatabaseEngine as DatabaseEngineClass } from "./engineCore";
import type {
	ColumnType,
	DatabaseColumnDef,
	DatabaseRow,
	DatabaseRowGroup,
	DatabaseRowPinning,
	DatabaseSort,
	DatabaseViewModelColumn,
	DatabaseViewModelRow,
	FacetBucket,
	FilterGroup,
} from "./types";

DatabaseEngineClass.prototype.filterRows = function filterRows(this: DatabaseEngine, rows: DatabaseRow[], filter: FilterGroup | null, columns: DatabaseViewModelColumn[]): DatabaseRow[] {
	if (!filter || filter.conditions.length === 0) return rows;
	return rows.filter((row) => this.matchesFilterGroup(row, filter, columns));
}
;
DatabaseEngineClass.prototype.sortRows = function sortRows(this: DatabaseEngine, rows: DatabaseRow[], sorts: DatabaseSort[], columns: DatabaseViewModelColumn[]): DatabaseRow[] {
	if (sorts.length === 0) return rows;
	const columnMap = new Map(columns.map((column) => [column.id, column]));
	return [...rows].sort((left, right) => {
		for (const sort of sorts) {
			const column = columnMap.get(sort.columnId);
			if (!column) continue;
			const compare = this.compareCellValues(
				left.cells[sort.columnId] ?? "",
				right.cells[sort.columnId] ?? "",
				column.type,
				column.options,
			);
			if (compare !== 0) {
				return sort.direction === "desc" ? -compare : compare;
			}
		}
		return left.crdtRowIndex - right.crdtRowIndex;
	});
}
;
DatabaseEngineClass.prototype.paginateRows = function paginateRows(this: DatabaseEngine, rows: DatabaseRow[], pageIndex: number, pageSize: number): DatabaseViewModelRow[] {
	const normalizedPageSize = Math.max(1, pageSize);
	const normalizedPageIndex = Math.max(0, pageIndex);
	const start = normalizedPageIndex * normalizedPageSize;
	return rows.slice(start, start + normalizedPageSize);
}
;
DatabaseEngineClass.prototype.splitPinnedRows = function splitPinnedRows(this: DatabaseEngine, 
	rows: DatabaseRow[],
	rowPinning?: DatabaseRowPinning,
): {
	top: DatabaseViewModelRow[];
	rows: DatabaseViewModelRow[];
	bottom: DatabaseViewModelRow[];
} {
	const rowMap = new Map(rows.map((row) => [row.id, row]));
	const topRowIds: string[] = [...(rowPinning?.top ?? [])];
	const bottomRowIds: string[] = [...(rowPinning?.bottom ?? [])];
	const top = topRowIds
		.map((rowId: string) => rowMap.get(rowId))
		.filter((row: DatabaseRow | undefined): row is DatabaseViewModelRow => row != null);
	const bottom = bottomRowIds
		.map((rowId: string) => rowMap.get(rowId))
		.filter((row: DatabaseRow | undefined): row is DatabaseViewModelRow => row != null);
	const pinnedIds = new Set([...top, ...bottom].map((row) => row.id));
	return {
		top,
		rows: rows.filter((row) => !pinnedIds.has(row.id)),
		bottom,
	};
}
;
DatabaseEngineClass.prototype.groupRows = function groupRows(this: DatabaseEngine, 
	rows: DatabaseViewModelRow[],
	groupBy: string | null,
	columns: DatabaseViewModelColumn[],
): DatabaseRowGroup[] {
	if (!groupBy) {
		return [];
	}
	const column = this.resolveGroupingColumn(groupBy, columns);
	if (!column) {
		return [];
	}
	const groups: DatabaseRowGroup[] = [];
	const groupByKey = new Map<string, DatabaseRowGroup>();
	for (const row of rows) {
		const label = this.formatGroupLabel(row.cells[column.id] ?? "", column);
		const key = `${column.id}:${label}`;
		const existing = groupByKey.get(key);
		if (existing) {
			existing.rows.push(row);
			continue;
		}
		const nextGroup: DatabaseRowGroup = {
			key,
			label,
			rows: [row],
		};
		groupByKey.set(key, nextGroup);
		groups.push(nextGroup);
	}
	return groups;
}
;
DatabaseEngineClass.prototype.facetColumnValues = function facetColumnValues(this: DatabaseEngine, 
	rows: DatabaseRow[],
	columnId: string,
	columns: DatabaseViewModelColumn[],
): FacetBucket[] {
	const column = columns.find((entry) => entry.id === columnId);
	if (!column) return [];
	const buckets = new Map<string, FacetBucket>();
	for (const row of rows) {
		const raw = row.cells[columnId] ?? "";
		if (!raw) continue;
		if (column.type === "multiSelect") {
			const values = parseDatabaseMultiSelectValue(raw);
			for (const value of values) {
				const option = resolveStoredSelectOption(value, column.options);
				const bucketValue = option?.id ?? value;
				const bucketLabel = option?.value ?? value;
				this.incrementFacetBucket(buckets, bucketValue, bucketLabel);
			}
			continue;
		}
		if (column.type === "select") {
			const option = resolveStoredSelectOption(raw, column.options);
			const bucketValue = option?.id ?? raw;
			const bucketLabel = option?.value ?? raw;
			this.incrementFacetBucket(buckets, bucketValue, bucketLabel);
			continue;
		}
		if (column.type === "checkbox") {
			const bucketValue = raw.toLowerCase() === "true" ? "true" : "false";
			const bucketLabel = bucketValue === "true" ? "Checked" : "Unchecked";
			this.incrementFacetBucket(buckets, bucketValue, bucketLabel);
			continue;
		}
		this.incrementFacetBucket(buckets, raw, raw);
	}
	return [...buckets.values()].sort((left, right) =>
		left.label.toLowerCase().localeCompare(right.label.toLowerCase()),
	);
}
;
