import type {
	CRDTAdapter,
	DatabaseRowPinning,
	DatabaseSort,
	DatabaseViewState,
	FilterCondition,
	FilterGroup,
} from "@pen/types";
import {
	type CRDTUnknownArray,
	type CRDTUnknownMap,
	type DatabaseViewMap,
	getDatabaseViews,
	getStringProp,
	getTableColumns,
	getTableContent,
	isCRDTArray,
	isCRDTMap,
} from "./crdtShapes";
import type { TableGridExecutor } from "./tableGridExecutor";

export class DatabaseViewHelpers {
	constructor(
		private readonly _adapter: CRDTAdapter,
		private readonly _tableGrid: TableGridExecutor,
	) {}

	normalizeViewState(
		blockMap: CRDTUnknownMap,
		view: DatabaseViewState,
	): DatabaseViewState {
		return {
			...view,
			...this.normalizeViewPatch(blockMap, view),
		};
	}

	normalizeViewPatch(
		blockMap: CRDTUnknownMap,
		patch: Partial<DatabaseViewState>,
	): Partial<DatabaseViewState> {
		const columnIds = this._readColumnIds(blockMap);
		const columnIdSet = new Set(columnIds);
		const rowIdSet = new Set(this._readRowIds(blockMap));
		const normalized: Partial<DatabaseViewState> = { ...patch };

		if (patch.visibleColumnIds) {
			normalized.visibleColumnIds = this._normalizeColumnIdList(
				patch.visibleColumnIds,
				columnIdSet,
			);
		}

		if (patch.columnOrder) {
			normalized.columnOrder = this._normalizeColumnIdList(
				patch.columnOrder,
				columnIdSet,
			);
		}

		if (patch.sort) {
			normalized.sort = this._normalizeSort(patch.sort, columnIdSet);
		}

		if (patch.groupBy !== undefined && patch.groupBy !== null) {
			normalized.groupBy = columnIdSet.has(patch.groupBy)
				? patch.groupBy
				: null;
		}

		if (patch.rowPinning) {
			normalized.rowPinning = this._normalizeRowPinning(
				patch.rowPinning,
				rowIdSet,
			);
		}

		if (patch.filter) {
			normalized.filter = this._normalizeFilterGroup(
				patch.filter,
				columnIdSet,
			);
		}

		return normalized;
	}

	findDatabaseViewMap(
		databaseViews: ReturnType<typeof getDatabaseViews>,
		viewId: string,
	): DatabaseViewMap | null {
		if (!databaseViews) {
			return null;
		}
		for (let index = 0; index < databaseViews.length; index++) {
			const viewMap = databaseViews.get(index);
			if (viewMap && isCRDTMap(viewMap) && getStringProp(viewMap, "id") === viewId) {
				return viewMap;
			}
		}
		return null;
	}

	insertStringIntoViewArray(
		viewMap: CRDTUnknownMap,
		key: "columnOrder" | "visibleColumnIds",
		value: string,
		index: number,
	): void {
		let arrayValue = viewMap.get(key);
		if (!isCRDTArray(arrayValue)) {
			arrayValue = this._adapter.createArray() as CRDTUnknownArray<string>;
			viewMap.set(key, arrayValue);
		}
		const array = arrayValue as CRDTUnknownArray<string>;
		for (let currentIndex = 0; currentIndex < array.length; currentIndex++) {
			if (array.get(currentIndex) === value) {
				array.delete(currentIndex, 1);
				break;
			}
		}
		array.insert(Math.max(0, Math.min(index, array.length)), [value]);
	}

	removeStringFromViewArray(
		viewMap: CRDTUnknownMap,
		key: "columnOrder" | "visibleColumnIds",
		value: string,
	): void {
		const arrayValue = viewMap.get(key);
		if (!isCRDTArray(arrayValue)) {
			return;
		}
		const array = arrayValue as CRDTUnknownArray<string>;
		for (let index = array.length - 1; index >= 0; index--) {
			if (array.get(index) === value) {
				array.delete(index, 1);
			}
		}
	}

	replaceViewStringArray(
		viewMap: CRDTUnknownMap,
		key: "columnOrder" | "visibleColumnIds",
		values: string[],
	): void {
		const array = this._adapter.createArray() as CRDTUnknownArray<string>;
		if (values.length > 0) {
			array.insert(0, values);
		}
		viewMap.set(key, array);
	}

	removeStringsFromNestedArray(
		map: CRDTUnknownMap,
		key: "top" | "bottom",
		values: string[],
	): void {
		const arrayValue = map.get(key);
		if (!isCRDTArray(arrayValue)) {
			return;
		}
		const array = arrayValue as CRDTUnknownArray<string>;
		const valueSet = new Set(values);
		for (let index = array.length - 1; index >= 0; index--) {
			if (valueSet.has(array.get(index))) {
				array.delete(index, 1);
			}
		}
	}

	createDatabaseViewMap(view: DatabaseViewState): DatabaseViewMap {
		const viewMap = this._adapter.createMap() as DatabaseViewMap;
		viewMap.set("id", view.id);
		viewMap.set("type", view.type);
		if (view.title) {
			viewMap.set("title", view.title);
		}
		if (view.visibleColumnIds) {
			const visibleColumnIds = this._adapter.createArray() as CRDTUnknownArray<string>;
			if (view.visibleColumnIds.length > 0) {
				visibleColumnIds.insert(0, view.visibleColumnIds);
			}
			viewMap.set("visibleColumnIds", visibleColumnIds);
		}
		if (view.columnOrder) {
			const columnOrder = this._adapter.createArray() as CRDTUnknownArray<string>;
			if (view.columnOrder.length > 0) {
				columnOrder.insert(0, view.columnOrder);
			}
			viewMap.set("columnOrder", columnOrder);
		}
		if (view.sort) {
			const sort = this._adapter.createArray() as CRDTUnknownArray<DatabaseViewMap>;
			if (view.sort.length > 0) {
				sort.insert(0, view.sort.map((entry) => this.createRecordMap(entry)));
			}
			viewMap.set("sort", sort);
		}
		if (view.filter) {
			viewMap.set("filter", this.createNestedRecord(view.filter));
		}
		if (view.groupBy !== undefined) {
			if (view.groupBy === null) {
				viewMap.set("groupBy", null);
			} else {
				viewMap.set("groupBy", view.groupBy);
			}
		}
		if (view.rowPinning) {
			viewMap.set("rowPinning", this.createNestedRecord(view.rowPinning));
		}
		if (view.pageIndex !== undefined) {
			viewMap.set("pageIndex", view.pageIndex);
		}
		if (view.pageSize !== undefined) {
			viewMap.set("pageSize", view.pageSize);
		}
		return viewMap;
	}

	createRecordMap(record: object): DatabaseViewMap {
		const map = this._adapter.createMap() as DatabaseViewMap;
		for (const [key, value] of Object.entries(record)) {
			if (value !== undefined) {
				map.set(key, value);
			}
		}
		return map;
	}

	createNestedRecord(record: object): DatabaseViewMap {
		const map = this._adapter.createMap() as DatabaseViewMap;
		for (const [key, value] of Object.entries(record)) {
			if (value === undefined) {
				continue;
			}
			if (Array.isArray(value)) {
				const array = this._adapter.createArray() as CRDTUnknownArray<unknown>;
				if (value.length > 0) {
					array.insert(
						0,
						value.map((entry) =>
							entry && typeof entry === "object"
								? this.createNestedRecord(entry)
								: entry,
						),
					);
				}
				map.set(key, array);
				continue;
			}
			if (value && typeof value === "object") {
				map.set(key, this.createNestedRecord(value));
				continue;
			}
			map.set(key, value);
		}
		return map;
	}

	private _readColumnIds(blockMap: CRDTUnknownMap): string[] {
		return this._tableGrid.readColumnIds(getTableColumns(blockMap));
	}

	private _readRowIds(blockMap: CRDTUnknownMap): string[] {
		const tableContent = getTableContent(blockMap);
		if (!tableContent) {
			return [];
		}

		const rowIds: string[] = [];
		for (let index = 0; index < tableContent.length; index++) {
			const row = tableContent.get(index);
			if (!row || !isCRDTMap(row)) {
				continue;
			}
			const rowId = getStringProp(row, "id");
			if (rowId) {
				rowIds.push(rowId);
			}
		}
		return rowIds;
	}

	private _normalizeColumnIdList(
		values: string[],
		columnIdSet: Set<string>,
	): string[] {
		const seen = new Set<string>();
		return values.filter((value) => {
			if (!columnIdSet.has(value) || seen.has(value)) {
				return false;
			}
			seen.add(value);
			return true;
		});
	}

	private _normalizeSort(
		sorts: DatabaseSort[],
		columnIdSet: Set<string>,
	): DatabaseSort[] {
		const seen = new Set<string>();
		return sorts.filter((sort) => {
			if (
				!columnIdSet.has(sort.columnId) ||
				(sort.direction !== "asc" && sort.direction !== "desc") ||
				seen.has(sort.columnId)
			) {
				return false;
			}
			seen.add(sort.columnId);
			return true;
		});
	}

	private _normalizeRowPinning(
		rowPinning: DatabaseRowPinning,
		rowIdSet: Set<string>,
	): DatabaseRowPinning {
		const top = this._normalizeUniqueIds(rowPinning.top ?? [], rowIdSet);
		const bottom = this._normalizeUniqueIds(
			(rowPinning.bottom ?? []).filter((rowId) => !top.includes(rowId)),
			rowIdSet,
		);
		return {
			...(top.length > 0 ? { top } : {}),
			...(bottom.length > 0 ? { bottom } : {}),
		};
	}

	private _normalizeUniqueIds(values: string[], allowed: Set<string>): string[] {
		const seen = new Set<string>();
		return values.filter((value) => {
			if (!allowed.has(value) || seen.has(value)) {
				return false;
			}
			seen.add(value);
			return true;
		});
	}

	private _normalizeFilterGroup(
		group: FilterGroup,
		columnIdSet: Set<string>,
	): FilterGroup | null {
		const conditions: Array<FilterCondition | FilterGroup> =
			group.conditions.flatMap<FilterCondition | FilterGroup>((condition) => {
				if (this._isFilterGroup(condition)) {
					const nestedGroup = this._normalizeFilterGroup(condition, columnIdSet);
					return nestedGroup ? [nestedGroup] : [];
				}
				return this._isValidFilterCondition(condition, columnIdSet)
					? [condition]
					: [];
			});

		if (conditions.length === 0) {
			return null;
		}

		return {
			operator: group.operator === "or" ? "or" : "and",
			conditions,
		};
	}

	private _isFilterGroup(
		value: FilterCondition | FilterGroup,
	): value is FilterGroup {
		return Array.isArray((value as FilterGroup).conditions);
	}

	private _isValidFilterCondition(
		condition: FilterCondition,
		columnIdSet: Set<string>,
	): boolean {
		return columnIdSet.has(condition.columnId);
	}
}
