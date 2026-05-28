import type {
	CRDTAdapter,
	DatabaseAddViewOp,
	DatabaseRowPinning,
	DatabaseRemoveViewOp,
	DatabaseSetActiveViewOp,
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
import { DatabaseViewHelpers } from "./databaseViewHelpers";
import { TableGridExecutor } from "./tableGridExecutor";

export class DatabaseViewExecutor {
	private readonly _adapter: CRDTAdapter;
	private readonly _helpers: DatabaseViewHelpers;
	private readonly _tableGrid: TableGridExecutor;

	constructor(adapter: CRDTAdapter, tableGrid: TableGridExecutor) {
		this._adapter = adapter;
		this._helpers = new DatabaseViewHelpers(adapter, tableGrid);
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

			this._helpers.replaceViewStringArray(viewMap, "columnOrder", columnIds);
			this._helpers.replaceViewStringArray(viewMap, "visibleColumnIds", columnIds);

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
			this._helpers.createDatabaseViewMap(
				this._helpers.normalizeViewState(blockMap, op.view),
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

			const normalizedPatch = this._helpers.normalizeViewPatch(blockMap, op.patch);
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
								? [this._helpers.createRecordMap(entry)]
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
						viewMap.set(key, this._helpers.createNestedRecord(value));
					}
					continue;
				}
				if (
					key === "filter" &&
					value &&
					typeof value === "object" &&
					!Array.isArray(value)
				) {
					viewMap.set(key, this._helpers.createNestedRecord(value));
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
		const targetViewMap = this._helpers.findDatabaseViewMap(databaseViews, op.viewId);
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
			this._helpers.insertStringIntoViewArray(
				viewMap,
				"columnOrder",
				columnId,
				columnIndex,
			);
			this._helpers.insertStringIntoViewArray(
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
			this._helpers.removeStringFromViewArray(viewMap, "columnOrder", columnId);
			this._helpers.removeStringFromViewArray(
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
			this._helpers.removeStringsFromNestedArray(rowPinning, "top", rowIds);
			this._helpers.removeStringsFromNestedArray(rowPinning, "bottom", rowIds);
		}
	}
}
