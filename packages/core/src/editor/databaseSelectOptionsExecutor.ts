import type {
	CRDTAdapter,
	DatabaseUpdateSelectOptionsOp,
} from "@pen/types";
import { generateId, parseDatabaseMultiSelectValue } from "@pen/types";
import {
	type CRDTUnknownArray,
	type CRDTUnknownMap,
	crdtMapToPlainRecord,
	findColumnIndexById,
	getStringProp,
	getTableContent,
	isCRDTArray,
	isCRDTMap,
} from "./crdtShapes";
import { TableGridExecutor } from "./tableGridExecutor";

export class DatabaseSelectOptionsExecutor {
	private readonly _adapter: CRDTAdapter;
	private readonly _tableGrid: TableGridExecutor;

	constructor(adapter: CRDTAdapter, tableGrid: TableGridExecutor) {
		this._adapter = adapter;
		this._tableGrid = tableGrid;
	}

	ensureOptionsArray(columnMap: CRDTUnknownMap): CRDTUnknownArray<CRDTUnknownMap> {
		const rawOptions = columnMap.get("options");
		let options =
			rawOptions &&
			typeof rawOptions === "object" &&
			"length" in rawOptions &&
			typeof (rawOptions as { get?: unknown }).get === "function"
				? (rawOptions as CRDTUnknownArray<CRDTUnknownMap>)
				: null;
		if (!options) {
			options = this._adapter.createArray() as CRDTUnknownArray<CRDTUnknownMap>;
			columnMap.set("options", options);
		}
		return options;
	}

	readColumnOptions(columnMap: CRDTUnknownMap): Array<{
		id: string;
		value: string;
		color?: string;
		label?: string;
	}> {
		const rawOptions = columnMap.get("options");
		if (!isCRDTArray(rawOptions)) {
			return [];
		}
		const optionsArray = rawOptions as CRDTUnknownArray<CRDTUnknownMap>;
		const options: Array<{
			id: string;
			value: string;
			color?: string;
			label?: string;
		}> = [];
		for (let index = 0; index < optionsArray.length; index++) {
			const optionMap = optionsArray.get(index);
			if (!optionMap || !isCRDTMap(optionMap)) {
				continue;
			}
			const option = crdtMapToPlainRecord(optionMap);
			if (
				!option ||
				typeof option.id !== "string" ||
				typeof option.value !== "string"
			) {
				continue;
			}
			options.push({
				id: option.id,
				value: option.value,
				color: typeof option.color === "string" ? option.color : undefined,
				label: typeof option.label === "string" ? option.label : undefined,
			});
		}
		return options;
	}

	applyMutation(
		blockMap: CRDTUnknownMap,
		columnMap: CRDTUnknownMap,
		op: DatabaseUpdateSelectOptionsOp,
	): void {
		const options = this.ensureOptionsArray(columnMap);

		switch (op.action) {
			case "add": {
				const option =
					op.option ??
					(op.value
						? {
								id: op.optionId ?? generateId(),
								value: op.value,
								color: op.color,
						  }
						: null);
				if (!option) {
					return;
				}
				options.insert(options.length, [
					this._createRecordMap(option as unknown as Record<string, unknown>),
				]);
				return;
			}
			case "remove": {
				if (!op.optionId) {
					return;
				}
				const removedOption = this._removeOptionById(options, op.optionId);
				if (!removedOption) {
					return;
				}
				this._clearDeletedOptionReferences(
					blockMap,
					columnMap,
					op.optionId,
					typeof removedOption.value === "string"
						? removedOption.value
						: undefined,
				);
				return;
			}
			case "rename":
			case "recolor": {
				if (!op.optionId) {
					return;
				}
				for (let index = 0; index < options.length; index++) {
					const optionMap = options.get(index);
					if (!optionMap || !isCRDTMap(optionMap)) {
						continue;
					}
					if (getStringProp(optionMap, "id") !== op.optionId) {
						continue;
					}
					if (op.action === "rename" && op.value) {
						optionMap.set("value", op.value);
						if (optionMap.get("label") !== undefined) {
							optionMap.set("label", op.value);
						}
					}
					if (op.action === "recolor" && op.color) {
						optionMap.set("color", op.color);
					}
					return;
				}
				return;
			}
			case "reorder": {
				if (!op.order || op.order.length === 0) {
					return;
				}
				const ordered = op.order
					.map((optionId) => this._removeOptionById(options, optionId))
					.filter(
						(option): option is Record<string, unknown> => option !== null,
					);
				if (ordered.length > 0) {
					options.insert(
						0,
						ordered.map((option) => this._createRecordMap(option)),
					);
				}
				return;
			}
		}
	}

	private _removeOptionById(
		options: CRDTUnknownArray<CRDTUnknownMap>,
		optionId: string,
	): Record<string, unknown> | null {
		for (let index = 0; index < options.length; index++) {
			const optionMap = options.get(index);
			if (!optionMap || !isCRDTMap(optionMap)) {
				continue;
			}
			if (getStringProp(optionMap, "id") !== optionId) {
				continue;
			}
			const option = crdtMapToPlainRecord(optionMap);
			options.delete(index, 1);
			return option;
		}
		return null;
	}

	private _clearDeletedOptionReferences(
		blockMap: CRDTUnknownMap,
		columnMap: CRDTUnknownMap,
		optionId: string,
		optionValue?: string,
	): void {
		const columnType = columnMap.get("type");
		const columnId = getStringProp(columnMap, "id");
		if (
			!columnId ||
			(columnType !== "select" && columnType !== "multiSelect")
		) {
			return;
		}

		const tableContent = getTableContent(blockMap);
		if (!tableContent) {
			return;
		}

		const columnIndex = findColumnIndexById(blockMap, columnId);
		if (columnIndex < 0) {
			return;
		}

		for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
			const rowMap = tableContent.get(rowIndex);
			if (!rowMap || !isCRDTMap(rowMap)) {
				continue;
			}
			const raw = this._tableGrid.readTableCellText(rowMap, columnIndex);
			if (!raw) {
				continue;
			}
			if (columnType === "select") {
				if (raw === optionId || raw === optionValue) {
					this._tableGrid.writePlainTextToTableCell(rowMap, columnIndex, "");
				}
				continue;
			}
			const parsed = parseDatabaseMultiSelectValue(raw);
			const nextValues = parsed.filter(
				(value) => value !== optionId && value !== optionValue,
			);
			if (nextValues.length !== parsed.length) {
				this._tableGrid.writePlainTextToTableCell(
					rowMap,
					columnIndex,
					nextValues.length > 0 ? JSON.stringify(nextValues) : "",
				);
			}
		}
	}

	private _createRecordMap(record: Record<string, unknown>): CRDTUnknownMap {
		const map = this._adapter.createMap() as CRDTUnknownMap;
		for (const [key, value] of Object.entries(record)) {
			if (value !== undefined) {
				map.set(key, value);
			}
		}
		return map;
	}
}
