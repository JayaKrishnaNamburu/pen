import type {
	CRDTAdapter,
	DatabaseAddViewOp,
	DatabaseRowPinning,
	DatabaseRemoveViewOp,
	DatabaseSetActiveViewOp,
	DatabaseSort,
	DatabaseViewState,
	FilterCondition,
	FilterGroup,
	DatabaseUpdateViewOp,
} from "@pen/types";
import { generateId } from "@pen/types";
import {
	type CRDTUnknownArray,
	type CRDTUnknownMap,
	type DatabaseViewArray,
	type DatabaseViewMap,
	getDatabaseViews,
	getStringProp,
	getTableColumns,
	getTableContent,
	isCRDTArray,
	isCRDTMap,
} from "./crdtShapes";
import { TableGridExecutor } from "./tableGridExecutor";

export class DatabaseViewExecutor {
	private readonly _adapter: CRDTAdapter;
	private readonly _tableGrid: TableGridExecutor;

	constructor(adapter: CRDTAdapter, tableGrid: TableGridExecutor) {
		this._adapter = adapter;
		this._tableGrid = tableGrid;
	}

	ensureViews(blockMap: CRDTUnknownMap): void {
		let databaseViews = getDatabaseViews(blockMap);
		if (!databaseViews || typeof databaseViews.insert !== "function") {
			databaseViews = this._adapter.createArray() as DatabaseViewArray;
			blockMap.set("databaseViews", databaseViews);
		}

		if (databaseViews.length === 0) {
			const tableColumns = getTableColumns(blockMap);
			const viewId = generateId();
			const visibleColumnIds = this._adapter.createArray() as CRDTUnknownArray<string>;
			const columnOrder = this._adapter.createArray() as CRDTUnknownArray<string>;
			const columnIds = this._tableGrid.readColumnIds(tableColumns);
			if (columnIds.length > 0) {
				visibleColumnIds.insert(0, columnIds);
				columnOrder.insert(0, columnIds);
			}
			const viewMap = this._adapter.createMap() as DatabaseViewMap;
			viewMap.set("id", viewId);
			viewMap.set("title", "Table view");
			viewMap.set("type", "table");
			viewMap.set("visibleColumnIds", visibleColumnIds);
			viewMap.set("columnOrder", columnOrder);
			databaseViews.insert(0, [viewMap]);
			blockMap.set("databasePrimaryViewId", viewId);
			return;
		}

		if (!blockMap.get("databasePrimaryViewId")) {
			const firstView = databaseViews.get(0);
			if (!firstView || !isCRDTMap(firstView)) {
				return;
			}
			const firstViewId = getStringProp(firstView, "id");
			if (firstViewId) {
				blockMap.set("databasePrimaryViewId", firstViewId);
			}
		}
	}

	resetColumns(blockMap: CRDTUnknownMap, columnIds: string[]): void {
		const databaseViews = getDatabaseViews(blockMap);
		if (!databaseViews) {
			return;
		}

		const columnIdSet = new Set(columnIds);
		for (let index = 0; index < databaseViews.length; index++) {
			const viewMap = databaseViews.get(index);
			if (!viewMap || !isCRDTMap(viewMap)) {
				continue;
			}

			this._replaceViewStringArray(viewMap, "columnOrder", columnIds);
			this._replaceViewStringArray(viewMap, "visibleColumnIds", columnIds);

			const sort = viewMap.get("sort");
			if (isCRDTArray(sort)) {
				for (let sortIndex = sort.length - 1; sortIndex >= 0; sortIndex--) {
					const sortEntry = sort.get(sortIndex);
					if (
						sortEntry &&
						isCRDTMap(sortEntry) &&
						!columnIdSet.has(getStringProp(sortEntry, "columnId") ?? "")
					) {
						sort.delete(sortIndex, 1);
					}
				}
			}

			const groupBy = viewMap.get("groupBy");
			if (typeof groupBy === "string" && !columnIdSet.has(groupBy)) {
				viewMap.delete?.("groupBy");
			}
		}
	}

	addView(blockMap: CRDTUnknownMap, op: DatabaseAddViewOp): boolean {
		const databaseViews = getDatabaseViews(blockMap);
		if (!databaseViews) {
			return false;
		}
		const nextIndex = Math.max(
			0,
			Math.min(
				typeof op.index === "number" ? op.index : databaseViews.length,
				databaseViews.length,
			),
		);
		databaseViews.insert(nextIndex, [
			this._createDatabaseViewMap(
				this._normalizeViewState(blockMap, op.view),
			),
		]);
		if (!blockMap.get("databasePrimaryViewId")) {
			blockMap.set("databasePrimaryViewId", op.view.id);
		}
		return true;
	}

	updateView(blockMap: CRDTUnknownMap, op: DatabaseUpdateViewOp): boolean {
		const databaseViews = getDatabaseViews(blockMap);
		if (!databaseViews) {
			return false;
		}

		const targetViewId = op.viewId ?? blockMap.get("databasePrimaryViewId");
		if (typeof targetViewId !== "string" || targetViewId.length === 0) {
			return false;
		}

		for (let index = 0; index < databaseViews.length; index++) {
			const viewMap = databaseViews.get(index);
			if (!viewMap || !isCRDTMap(viewMap)) {
				continue;
			}
			if (getStringProp(viewMap, "id") !== targetViewId) {
				continue;
			}

			const normalizedPatch = this._normalizeViewPatch(blockMap, op.patch);
			for (const [key, value] of Object.entries(normalizedPatch)) {
				if (value === undefined) {
					continue;
				}
				if (value === null) {
					viewMap.delete?.(key);
					continue;
				}
				if (
					(key === "visibleColumnIds" || key === "columnOrder") &&
					Array.isArray(value)
				) {
					const array = this._adapter.createArray() as CRDTUnknownArray<string>;
					const stringValues = value.filter(
						(entry): entry is string => typeof entry === "string",
					);
					if (stringValues.length > 0) {
						array.insert(0, stringValues);
					}
					viewMap.set(key, array);
					continue;
				}
				if (key === "sort" && Array.isArray(value)) {
					const array = this._adapter.createArray() as CRDTUnknownArray<DatabaseViewMap>;
					if (value.length > 0) {
						const sortEntries = value.flatMap((entry) =>
							entry != null && typeof entry === "object"
								? [this._createRecordMap(entry)]
								: [],
						);
						array.insert(0, sortEntries);
					}
					viewMap.set(key, array);
					continue;
				}
				if (
					key === "rowPinning" &&
					value &&
					typeof value === "object" &&
					!Array.isArray(value)
				) {
					const rowPinning = value as DatabaseRowPinning;
					if (!rowPinning.top?.length && !rowPinning.bottom?.length) {
						viewMap.delete?.(key);
					} else {
						viewMap.set(key, this._createNestedRecord(value));
					}
					continue;
				}
				if (
					key === "filter" &&
					value &&
					typeof value === "object" &&
					!Array.isArray(value)
				) {
					viewMap.set(key, this._createNestedRecord(value));
					continue;
				}
				viewMap.set(key, value);
			}

			return true;
		}

		return false;
	}

	removeView(blockMap: CRDTUnknownMap, op: DatabaseRemoveViewOp): boolean {
		const databaseViews = getDatabaseViews(blockMap);
		if (!databaseViews) {
			return false;
		}

		for (let index = 0; index < databaseViews.length; index++) {
			const viewMap = databaseViews.get(index);
			if (!viewMap || !isCRDTMap(viewMap)) {
				continue;
			}
			if (getStringProp(viewMap, "id") !== op.viewId) {
				continue;
			}
			databaseViews.delete(index, 1);
			if (blockMap.get("databasePrimaryViewId") === op.viewId) {
				const nextView = databaseViews.get(0);
				const nextViewId =
					nextView && isCRDTMap(nextView)
						? getStringProp(nextView, "id")
						: undefined;
				if (typeof nextViewId === "string") {
					blockMap.set("databasePrimaryViewId", nextViewId);
				} else {
					blockMap.delete?.("databasePrimaryViewId");
				}
			}
			return true;
		}

		return false;
	}

	setActiveView(blockMap: CRDTUnknownMap, op: DatabaseSetActiveViewOp): boolean {
		const databaseViews = getDatabaseViews(blockMap);
		const targetViewMap = this._findDatabaseViewMap(databaseViews, op.viewId);
		if (!targetViewMap) {
			return false;
		}
		blockMap.set("databasePrimaryViewId", op.viewId);
		return true;
	}

	insertColumnIntoViews(
		blockMap: CRDTUnknownMap,
		columnId: string,
		columnIndex: number,
		viewId?: string,
	): void {
		const databaseViews = getDatabaseViews(blockMap);
		if (!databaseViews) {
			return;
		}
		const targetViewId =
			viewId ?? blockMap.get("databasePrimaryViewId") ?? undefined;
		for (let index = 0; index < databaseViews.length; index++) {
			const viewMap = databaseViews.get(index);
			if (!viewMap || !isCRDTMap(viewMap)) {
				continue;
			}
			const currentViewId = getStringProp(viewMap, "id");
			if (targetViewId && currentViewId !== targetViewId) {
				continue;
			}
			this._insertStringIntoViewArray(
				viewMap,
				"columnOrder",
				columnId,
				columnIndex,
			);
			this._insertStringIntoViewArray(
				viewMap,
				"visibleColumnIds",
				columnId,
				columnIndex,
			);
			if (targetViewId) {
				return;
			}
		}
	}

	removeColumnFromViews(blockMap: CRDTUnknownMap, columnId: string): void {
		const databaseViews = getDatabaseViews(blockMap);
		if (!databaseViews) {
			return;
		}
		for (let index = 0; index < databaseViews.length; index++) {
			const viewMap = databaseViews.get(index);
			if (!viewMap || !isCRDTMap(viewMap)) {
				continue;
			}
			this._removeStringFromViewArray(viewMap, "columnOrder", columnId);
			this._removeStringFromViewArray(
				viewMap,
				"visibleColumnIds",
				columnId,
			);
			const sort = viewMap.get("sort");
			if (isCRDTArray(sort)) {
				for (let sortIndex = sort.length - 1; sortIndex >= 0; sortIndex--) {
					const sortEntry = sort.get(sortIndex);
					if (
						sortEntry &&
						isCRDTMap(sortEntry) &&
						getStringProp(sortEntry, "columnId") === columnId
					) {
						sort.delete(sortIndex, 1);
					}
				}
			}
		}
	}

	removeRowsFromViews(blockMap: CRDTUnknownMap, rowIds: string[]): void {
		if (rowIds.length === 0) {
			return;
		}
		const databaseViews = getDatabaseViews(blockMap);
		if (!databaseViews) {
			return;
		}
		for (let index = 0; index < databaseViews.length; index++) {
			const viewMap = databaseViews.get(index);
			if (!viewMap || !isCRDTMap(viewMap)) {
				continue;
			}
			const rowPinning = viewMap.get("rowPinning");
			if (!rowPinning || !isCRDTMap(rowPinning)) {
				continue;
			}
			this._removeStringsFromNestedArray(rowPinning, "top", rowIds);
			this._removeStringsFromNestedArray(rowPinning, "bottom", rowIds);
		}
	}

	private _normalizeViewState(
		blockMap: CRDTUnknownMap,
		view: DatabaseViewState,
	): DatabaseViewState {
		return {
			...view,
			...this._normalizeViewPatch(blockMap, view),
		};
	}

	private _normalizeViewPatch(
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

	private _findDatabaseViewMap(
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

	private _insertStringIntoViewArray(
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

	private _removeStringFromViewArray(
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

	private _replaceViewStringArray(
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

	private _removeStringsFromNestedArray(
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

	private _createDatabaseViewMap(view: DatabaseViewState): DatabaseViewMap {
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
				sort.insert(0, view.sort.map((entry) => this._createRecordMap(entry)));
			}
			viewMap.set("sort", sort);
		}
		if (view.filter) {
			viewMap.set("filter", this._createNestedRecord(view.filter));
		}
		if (view.groupBy !== undefined) {
			if (view.groupBy === null) {
				viewMap.set("groupBy", null);
			} else {
				viewMap.set("groupBy", view.groupBy);
			}
		}
		if (view.rowPinning) {
			viewMap.set("rowPinning", this._createNestedRecord(view.rowPinning));
		}
		if (view.pageIndex !== undefined) {
			viewMap.set("pageIndex", view.pageIndex);
		}
		if (view.pageSize !== undefined) {
			viewMap.set("pageSize", view.pageSize);
		}
		return viewMap;
	}

	private _createRecordMap(record: object): DatabaseViewMap {
		const map = this._adapter.createMap() as DatabaseViewMap;
		for (const [key, value] of Object.entries(record)) {
			if (value !== undefined) {
				map.set(key, value);
			}
		}
		return map;
	}

	private _createNestedRecord(record: object): DatabaseViewMap {
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
								? this._createNestedRecord(entry)
								: entry,
						),
					);
				}
				map.set(key, array);
				continue;
			}
			if (value && typeof value === "object") {
				map.set(key, this._createNestedRecord(value));
				continue;
			}
			map.set(key, value);
		}
		return map;
	}
}
