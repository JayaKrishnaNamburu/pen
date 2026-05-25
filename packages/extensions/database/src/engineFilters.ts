import {
	formatStoredMultiSelectValue,
	formatStoredSelectValue,
	parseDatabaseMultiSelectValue,
	resolveStoredSelectOption,
} from "@pen/types";
import type { DatabaseEngine } from "./engineCore";
import {
	DatabaseEngine as DatabaseEngineClass,
	VALID_COLUMN_TYPES,
} from "./engineCore";
import type {
	ColumnType,
	DatabaseColumnDef,
	DatabaseRow,
	DatabaseViewModelColumn,
	DatabaseViewState,
	FacetBucket,
	FilterCondition,
	FilterGroup,
	FilterOperator,
} from "./types";

DatabaseEngineClass.prototype.deriveViewColumns = function deriveViewColumns(this: DatabaseEngine, view: DatabaseViewState): DatabaseViewModelColumn[] {
	const schema = this.deriveColumnSchema();
	const schemaById = new Map(schema.map((column, columnIndex) => [column.id, { column, columnIndex }]));
	const columnOrder = view.columnOrder ?? schema.map((column) => column.id);
	const visibleColumnIds = new Set(
		view.visibleColumnIds ?? schema.filter((column) => !column.hidden).map((column) => column.id),
	);
	const orderedIds = [
		...columnOrder,
		...schema.map((column) => column.id).filter((columnId) => !columnOrder.includes(columnId)),
	];

	const orderedColumns = orderedIds
		.map((columnId) => schemaById.get(columnId))
		.filter((entry): entry is { column: DatabaseColumnDef; columnIndex: number } => entry != null)
		.filter(({ column }) => !column.hidden && visibleColumnIds.has(column.id))
		.map(({ column, columnIndex }) => ({
			id: column.id,
			title: column.title,
			type: this.normalizeColumnType(column.type),
			columnIndex,
			width: column.width,
			hidden: column.hidden,
			pinned: column.pinned,
			options: column.options,
			format: column.format,
			readonly: column.readonly,
		}));

	const leftColumns = orderedColumns.filter((column) => column.pinned === "left");
	const centerColumns = orderedColumns.filter((column) => column.pinned == null);
	const rightColumns = orderedColumns.filter((column) => column.pinned === "right");
	return [...leftColumns, ...centerColumns, ...rightColumns];
}
;
DatabaseEngineClass.prototype.matchesFilterGroup = function matchesFilterGroup(this: DatabaseEngine, row: DatabaseRow, filterGroup: FilterGroup, columns: DatabaseViewModelColumn[]): boolean {
	const results = filterGroup.conditions.map((condition) =>
		this.isFilterGroup(condition)
			? this.matchesFilterGroup(row, condition, columns)
			: this.matchesFilterCondition(row, condition, columns),
	);
	return filterGroup.operator === "or" ? results.some(Boolean) : results.every(Boolean);
}
;
DatabaseEngineClass.prototype.matchesFilterCondition = function matchesFilterCondition(this: DatabaseEngine, row: DatabaseRow, condition: FilterCondition, columns: DatabaseViewModelColumn[]): boolean {
	const column = columns.find((entry) => entry.id === condition.columnId);
	if (!column) return true;
	return this.matchesOperator(
		row.cells[condition.columnId] ?? "",
		condition.operator,
		condition.value,
		column.type,
		column.options,
	);
}
;
DatabaseEngineClass.prototype.matchesOperator = function matchesOperator(this: DatabaseEngine, 
	rawValue: string,
	operator: FilterOperator,
	filterValue: string | string[] | null,
	columnType: ColumnType,
	options?: DatabaseColumnDef["options"],
): boolean {
	const normalizedRawValue =
		columnType === "select"
			? resolveStoredSelectOption(rawValue, options)?.id ?? rawValue
			: rawValue;
	if (columnType === "date") {
		return this.matchesDateOperator(normalizedRawValue, operator, filterValue);
	}
	const lowerValue = normalizedRawValue.toLowerCase();
	switch (operator) {
		case "is":
			return lowerValue === String(filterValue ?? "").toLowerCase();
		case "is_not":
			return lowerValue !== String(filterValue ?? "").toLowerCase();
		case "contains":
			if (columnType === "multiSelect") {
				return parseDatabaseMultiSelectValue(rawValue).includes(
					String(filterValue ?? ""),
				);
			}
			return lowerValue.includes(String(filterValue ?? "").toLowerCase());
		case "not_contains":
			if (columnType === "multiSelect") {
				return !parseDatabaseMultiSelectValue(rawValue).includes(
					String(filterValue ?? ""),
				);
			}
			return !lowerValue.includes(String(filterValue ?? "").toLowerCase());
		case "starts_with":
			return lowerValue.startsWith(String(filterValue ?? "").toLowerCase());
		case "ends_with":
			return lowerValue.endsWith(String(filterValue ?? "").toLowerCase());
		case "is_empty":
			return rawValue === "";
		case "is_not_empty":
			return rawValue !== "";
		case "is_checked":
			return rawValue.toLowerCase() === "true";
		case "is_unchecked":
			return rawValue.toLowerCase() !== "true";
		case "is_any_of": {
			const values = Array.isArray(filterValue) ? filterValue : [String(filterValue ?? "")];
			if (columnType === "multiSelect") {
				const selectedValues = parseDatabaseMultiSelectValue(rawValue);
				return values.some((value) => selectedValues.includes(value));
			}
			return values.includes(normalizedRawValue);
		}
		case "is_none_of": {
			const values = Array.isArray(filterValue) ? filterValue : [String(filterValue ?? "")];
			if (columnType === "multiSelect") {
				const selectedValues = parseDatabaseMultiSelectValue(rawValue);
				return values.every((value) => !selectedValues.includes(value));
			}
			return !values.includes(normalizedRawValue);
		}
		case "=":
			return this.comparePrimitive(normalizedRawValue, String(filterValue ?? ""), columnType) === 0;
		case "!=":
			return this.comparePrimitive(normalizedRawValue, String(filterValue ?? ""), columnType) !== 0;
		case ">":
			return this.comparePrimitive(normalizedRawValue, String(filterValue ?? ""), columnType) > 0;
		case "<":
			return this.comparePrimitive(normalizedRawValue, String(filterValue ?? ""), columnType) < 0;
		case ">=":
			return this.comparePrimitive(normalizedRawValue, String(filterValue ?? ""), columnType) >= 0;
		case "<=":
			return this.comparePrimitive(normalizedRawValue, String(filterValue ?? ""), columnType) <= 0;
		default:
			return true;
	}
}
;
DatabaseEngineClass.prototype.matchesDateOperator = function matchesDateOperator(this: DatabaseEngine, 
	rawValue: string,
	operator: FilterOperator,
	filterValue: string | string[] | null,
): boolean {
	if (operator === "is_empty") {
		return rawValue === "";
	}
	if (operator === "is_not_empty") {
		return rawValue !== "";
	}
	const rawDate = this.parseFilterDate(rawValue);
	if (!rawDate) {
		return false;
	}
	switch (operator) {
		case "is": {
			const targetDate = this.parseFilterDate(String(filterValue ?? ""));
			return targetDate ? this.isSameCalendarDay(rawDate, targetDate) : false;
		}
		case "is_before": {
			const targetDate = this.parseFilterDate(String(filterValue ?? ""));
			return targetDate ? this.startOfCalendarDay(rawDate) < this.startOfCalendarDay(targetDate) : false;
		}
		case "is_after": {
			const targetDate = this.parseFilterDate(String(filterValue ?? ""));
			return targetDate ? this.startOfCalendarDay(rawDate) > this.startOfCalendarDay(targetDate) : false;
		}
		case "is_between": {
			if (!Array.isArray(filterValue) || filterValue.length < 2) {
				return false;
			}
			const startDate = this.parseFilterDate(filterValue[0] ?? "");
			const endDate = this.parseFilterDate(filterValue[1] ?? "");
			if (!startDate || !endDate) {
				return false;
			}
			const rawTime = this.startOfCalendarDay(rawDate);
			return rawTime >= this.startOfCalendarDay(startDate) && rawTime <= this.startOfCalendarDay(endDate);
		}
		case "is_relative":
			return this.matchesRelativeDate(rawDate, String(filterValue ?? ""));
		default:
			return true;
	}
}
;
DatabaseEngineClass.prototype.compareCellValues = function compareCellValues(this: DatabaseEngine, 
	left: string,
	right: string,
	columnType: ColumnType,
	options?: DatabaseColumnDef["options"],
): number {
	if (columnType === "select") {
		return this.comparePrimitive(
			formatStoredSelectValue(left, options),
			formatStoredSelectValue(right, options),
			"text",
		);
	}
	if (columnType === "multiSelect") {
		return this.comparePrimitive(
			formatStoredMultiSelectValue(left, options),
			formatStoredMultiSelectValue(right, options),
			"text",
		);
	}
	return this.comparePrimitive(left, right, columnType);
}
;
DatabaseEngineClass.prototype.comparePrimitive = function comparePrimitive(this: DatabaseEngine, left: string, right: string, columnType: ColumnType): number {
	switch (columnType) {
		case "number":
			return (Number(left) || 0) - (Number(right) || 0);
		case "date":
			return (new Date(left).getTime() || 0) - (new Date(right).getTime() || 0);
		case "checkbox":
			return (left.toLowerCase() === "true" ? 1 : 0) - (right.toLowerCase() === "true" ? 1 : 0);
		default:
			return left.toLowerCase().localeCompare(right.toLowerCase());
	}
}
;
DatabaseEngineClass.prototype.parseFilterDate = function parseFilterDate(this: DatabaseEngine, raw: string): Date | null {
	if (!raw) {
		return null;
	}
	const value = new Date(raw);
	return Number.isNaN(value.getTime()) ? null : value;
}
;
DatabaseEngineClass.prototype.startOfCalendarDay = function startOfCalendarDay(this: DatabaseEngine, value: Date): number {
	return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}
;
DatabaseEngineClass.prototype.endOfCalendarDay = function endOfCalendarDay(this: DatabaseEngine, value: Date): number {
	return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999).getTime();
}
;
DatabaseEngineClass.prototype.startOfCalendarWeek = function startOfCalendarWeek(this: DatabaseEngine, value: Date): number {
	const nextValue = new Date(value.getFullYear(), value.getMonth(), value.getDate());
	nextValue.setDate(nextValue.getDate() - nextValue.getDay());
	return nextValue.getTime();
}
;
DatabaseEngineClass.prototype.endOfCalendarWeek = function endOfCalendarWeek(this: DatabaseEngine, value: Date): number {
	const nextValue = new Date(value.getFullYear(), value.getMonth(), value.getDate());
	nextValue.setDate(nextValue.getDate() + (6 - nextValue.getDay()));
	return this.endOfCalendarDay(nextValue);
}
;
DatabaseEngineClass.prototype.startOfCalendarMonth = function startOfCalendarMonth(this: DatabaseEngine, value: Date): number {
	return new Date(value.getFullYear(), value.getMonth(), 1).getTime();
}
;
DatabaseEngineClass.prototype.endOfCalendarMonth = function endOfCalendarMonth(this: DatabaseEngine, value: Date): number {
	return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
}
;
DatabaseEngineClass.prototype.isSameCalendarDay = function isSameCalendarDay(this: DatabaseEngine, left: Date, right: Date): boolean {
	return left.getFullYear() === right.getFullYear()
		&& left.getMonth() === right.getMonth()
		&& left.getDate() === right.getDate();
}
;
DatabaseEngineClass.prototype.matchesRelativeDate = function matchesRelativeDate(this: DatabaseEngine, rawDate: Date, relativeValue: string): boolean {
	const now = new Date();
	const rawTime = rawDate.getTime();
	const todayStart = this.startOfCalendarDay(now);
	switch (relativeValue) {
		case "today":
			return rawTime >= todayStart && rawTime <= this.endOfCalendarDay(now);
		case "yesterday": {
			const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
			return rawTime >= this.startOfCalendarDay(yesterday) && rawTime <= this.endOfCalendarDay(yesterday);
		}
		case "tomorrow": {
			const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
			return rawTime >= this.startOfCalendarDay(tomorrow) && rawTime <= this.endOfCalendarDay(tomorrow);
		}
		case "this_week":
			return rawTime >= this.startOfCalendarWeek(now) && rawTime <= this.endOfCalendarWeek(now);
		case "last_7_days": {
			const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
			return rawTime >= this.startOfCalendarDay(start) && rawTime <= this.endOfCalendarDay(now);
		}
		case "next_7_days": {
			const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6);
			return rawTime >= todayStart && rawTime <= this.endOfCalendarDay(end);
		}
		case "this_month":
			return rawTime >= this.startOfCalendarMonth(now) && rawTime <= this.endOfCalendarMonth(now);
		default:
			return false;
	}
}
;
DatabaseEngineClass.prototype.incrementFacetBucket = function incrementFacetBucket(this: DatabaseEngine, 
	buckets: Map<string, FacetBucket>,
	value: string,
	label: string,
): void {
	const existing = buckets.get(value);
	if (existing) {
		existing.count += 1;
		return;
	}
	buckets.set(value, { value, label, count: 1 });
}
;
DatabaseEngineClass.prototype.formatGroupLabel = function formatGroupLabel(this: DatabaseEngine, 
	raw: string,
	column: DatabaseViewModelColumn,
): string {
	const formatted = this.formatCellDisplay(
		raw,
		column.type,
		column.format,
		column.options,
	);
	return formatted || "(empty)";
}
;
DatabaseEngineClass.prototype.resolveGroupingColumn = function resolveGroupingColumn(this: DatabaseEngine, 
	groupBy: string,
	columns: DatabaseViewModelColumn[],
): DatabaseViewModelColumn | null {
	const visibleColumn = columns.find((entry) => entry.id === groupBy);
	if (visibleColumn) {
		return visibleColumn;
	}
	const schema = this.deriveColumnSchema();
	const schemaColumn = schema.find((entry) => entry.id === groupBy);
	if (!schemaColumn) {
		return null;
	}
	return {
		id: schemaColumn.id,
		title: schemaColumn.title,
		type: this.normalizeColumnType(schemaColumn.type),
		columnIndex: schema.findIndex((entry) => entry.id === groupBy),
		width: schemaColumn.width,
		hidden: schemaColumn.hidden,
		pinned: schemaColumn.pinned,
		options: schemaColumn.options,
		format: schemaColumn.format,
		readonly: schemaColumn.readonly,
	};
}
;
DatabaseEngineClass.prototype.normalizeColumnType = function normalizeColumnType(this: DatabaseEngine, type: string | undefined): ColumnType {
	return type && VALID_COLUMN_TYPES.has(type as ColumnType) ? (type as ColumnType) : "text";
}
;
DatabaseEngineClass.prototype.isFilterGroup = function isFilterGroup(this: DatabaseEngine, value: FilterCondition | FilterGroup): value is FilterGroup {
	return "conditions" in value;
}
;
