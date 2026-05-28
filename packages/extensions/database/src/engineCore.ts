import {
	coerceDatabaseValue,
	formatStoredMultiSelectValue,
	formatStoredSelectValue,
	parseDatabaseMultiSelectValue,
	resolveStoredSelectOption,
} from "@pen/types";
import type { BlockHandle, Editor } from "@pen/types";
import type {
	ColumnType,
	DatabaseColumnDef,
	DatabaseDataProvider,
	DatabasePage,
	DatabaseQuery,
	DatabaseRowGroup,
	DatabaseRowPinning,
	DatabaseRow,
	DatabaseSort,
	FacetBucket,
	DatabaseViewModel,
	DatabaseViewModelColumn,
	DatabaseViewModelRow,
	DatabaseViewState,
	FilterCondition,
	FilterGroup,
	FilterOperator,
	NumberFormat,
	DateFormat,
} from "./types";

const DEFAULT_PAGE_SIZE = 50;
export const VALID_COLUMN_TYPES = new Set<ColumnType>([
	"text",
	"number",
	"checkbox",
	"select",
	"multiSelect",
	"date",
	"url",
	"email",
	"relation",
	"formula",
]);

export interface DatabaseEngine {
	filterRows(rows: DatabaseRow[], filter: FilterGroup | null, columns: DatabaseViewModelColumn[]): DatabaseRow[];
	sortRows(rows: DatabaseRow[], sorts: DatabaseSort[], columns: DatabaseViewModelColumn[]): DatabaseRow[];
	paginateRows(rows: DatabaseRow[], pageIndex: number, pageSize: number): DatabaseViewModelRow[];
	splitPinnedRows(
		rows: DatabaseRow[],
		rowPinning?: DatabaseRowPinning,
	): {
		top: DatabaseViewModelRow[];
		rows: DatabaseViewModelRow[];
		bottom: DatabaseViewModelRow[];
	};
	groupRows(
		rows: DatabaseViewModelRow[],
		groupBy: string | null,
		columns: DatabaseViewModelColumn[],
	): DatabaseRowGroup[];
	facetColumnValues(
		rows: DatabaseRow[],
		columnId: string,
		columns: DatabaseViewModelColumn[],
	): FacetBucket[];
	deriveViewColumns(view: DatabaseViewState): DatabaseViewModelColumn[];
	matchesFilterGroup(row: DatabaseRow, filterGroup: FilterGroup, columns: DatabaseViewModelColumn[]): boolean;
	matchesFilterCondition(row: DatabaseRow, condition: FilterCondition, columns: DatabaseViewModelColumn[]): boolean;
	matchesOperator(
		rawValue: string,
		operator: FilterOperator,
		filterValue: string | string[] | null,
		columnType: ColumnType,
		options?: DatabaseColumnDef["options"],
	): boolean;
	matchesDateOperator(
		rawValue: string,
		operator: FilterOperator,
		filterValue: string | string[] | null,
	): boolean;
	compareCellValues(
		left: string,
		right: string,
		columnType: ColumnType,
		options?: DatabaseColumnDef["options"],
	): number;
	comparePrimitive(left: string, right: string, columnType: ColumnType): number;
	parseFilterDate(raw: string): Date | null;
	startOfCalendarDay(value: Date): number;
	endOfCalendarDay(value: Date): number;
	startOfCalendarWeek(value: Date): number;
	endOfCalendarWeek(value: Date): number;
	startOfCalendarMonth(value: Date): number;
	endOfCalendarMonth(value: Date): number;
	isSameCalendarDay(left: Date, right: Date): boolean;
	matchesRelativeDate(rawDate: Date, relativeValue: string): boolean;
	incrementFacetBucket(
		buckets: Map<string, FacetBucket>,
		value: string,
		label: string,
	): void;
	formatGroupLabel(
		raw: string,
		column: DatabaseViewModelColumn,
	): string;
	resolveGroupingColumn(
		groupBy: string,
		columns: DatabaseViewModelColumn[],
	): DatabaseViewModelColumn | null;
	normalizeColumnType(type: string | undefined): ColumnType;
	isFilterGroup(value: FilterCondition | FilterGroup): value is FilterGroup;
}

export class DatabaseEngine {
	private readonly _editor: Editor;
	private readonly _blockId: string;
	private _dataProvider: DatabaseDataProvider | null = null;

	constructor(editor: Editor, blockId: string) {
		this._editor = editor;
		this._blockId = blockId;
	}

	get blockId(): string {
		return this._blockId;
	}

	get editor(): Editor {
		return this._editor;
	}

	get dataProvider(): DatabaseDataProvider | null {
		return this._dataProvider;
	}

	setDataProvider(provider: DatabaseDataProvider): void {
		this._dataProvider = provider;
	}

	get isRemote(): boolean {
		const block = this._block;
		return block?.props.dataSource === "remote" || block?.props.dataSource === "hybrid";
	}

	private get _block(): BlockHandle | null {
		return this._editor.getBlock(this._blockId) ?? null;
	}

	deriveColumnSchema(): DatabaseColumnDef[] {
		const block = this._block;
		if (!block) return [];
		return block.tableColumns().map((column, index) => ({
			id: column.id || `col-${index}`,
			title: column.title || "Untitled",
			type: this.normalizeColumnType(column.type),
			width: column.width,
			hidden: column.hidden,
			pinned: column.pinned,
			options: column.options,
			format: column.format,
			readonly: column.readonly,
		}));
	}

	deriveRowData(): DatabaseRow[] {
		const block = this._block;
		if (!block) return [];
		const columns = this.deriveColumnSchema();
		const rowCount = block.tableRowCount();
		const columnCount = Math.max(columns.length, block.tableColumnCount());
		const rows: DatabaseRow[] = [];

		for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
			const rowHandle = typeof block.tableRow === "function" ? block.tableRow(rowIndex) : null;
			const cells: Record<string, string> = {};
			for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
				const columnId = columns[columnIndex]?.id ?? `col-${columnIndex}`;
				cells[columnId] = block.tableCell(rowIndex, columnIndex)?.textContent() ?? "";
			}
			rows.push({
				id: rowHandle?.id ?? `row-${rowIndex}`,
				crdtRowIndex: rowIndex,
				cells,
			});
		}

		return rows;
	}

	deriveViewState(): DatabaseViewState {
		const block = this._block;
		const columns = this.deriveColumnSchema();
		const fallbackColumnIds = columns.map((column) => column.id);
		const activeView = block?.databaseActiveView();
		if (activeView) {
			return {
				...activeView,
				visibleColumnIds: activeView.visibleColumnIds ?? fallbackColumnIds,
				columnOrder: activeView.columnOrder ?? fallbackColumnIds,
				pageIndex: activeView.pageIndex ?? 0,
				pageSize: activeView.pageSize ?? DEFAULT_PAGE_SIZE,
			};
		}

		return {
			id: "default",
			title: "Table view",
			type: "table",
			visibleColumnIds: fallbackColumnIds,
			columnOrder: fallbackColumnIds,
			sort: [],
			filter: null,
			pageIndex: 0,
			pageSize: DEFAULT_PAGE_SIZE,
		};
	}

	createQuery(options?: {
		view?: DatabaseViewState | null;
		override?: Partial<DatabaseQuery>;
	}): DatabaseQuery {
		const view = options?.view ?? this.deriveViewState();
		return {
			sort: options?.override?.sort ?? view.sort,
			filter: options?.override?.filter ?? view.filter ?? undefined,
			groupBy: options?.override?.groupBy ?? view.groupBy ?? null,
			pageIndex: options?.override?.pageIndex ?? view.pageIndex ?? 0,
			pageSize: options?.override?.pageSize ?? view.pageSize ?? DEFAULT_PAGE_SIZE,
		};
	}

	buildViewModel(options?: {
		view?: DatabaseViewState | null;
		rows?: DatabaseRow[];
		globalSearch?: string;
		totalRows?: number;
		remotePage?: boolean;
	}): DatabaseViewModel {
		const view = options?.view ?? this.deriveViewState();
		const columns = this.deriveViewColumns(view);
		const pageIndex = view.pageIndex ?? 0;
		const pageSize = view.pageSize ?? DEFAULT_PAGE_SIZE;
		const sourceRows = options?.rows ?? this.deriveRowData();

		if (options?.remotePage) {
			const totalRows = options?.totalRows ?? sourceRows.length;
			const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
			return {
				view,
				columns,
				allRows: sourceRows,
				pinnedTopRows: [],
				rows: sourceRows,
				pinnedBottomRows: [],
				rowGroups: this.groupRows(sourceRows, view.groupBy ?? null, columns),
				totalRows,
				pageIndex,
				pageSize,
				pageCount,
			};
		}

		const searchedRows = this.searchRows(sourceRows, options?.globalSearch ?? "", columns);
		const filteredRows = this.filterRows(searchedRows, view.filter ?? null, columns);
		const sortedRows = this.sortRows(filteredRows, view.sort ?? [], columns);
		const pinnedRows = this.splitPinnedRows(sortedRows, view.rowPinning);
		const rows = this.paginateRows(pinnedRows.rows, pageIndex, pageSize);
		const totalRows = pinnedRows.rows.length;
		const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));

		return {
			view,
			columns,
			allRows: sortedRows,
			pinnedTopRows: pinnedRows.top,
			rows,
			pinnedBottomRows: pinnedRows.bottom,
			rowGroups: this.groupRows(rows, view.groupBy ?? null, columns),
			totalRows,
			pageIndex,
			pageSize,
			pageCount,
		};
	}

	buildRemoteViewModel(page: DatabasePage, view?: DatabaseViewState | null): DatabaseViewModel {
		return this.buildViewModel({
			view,
			rows: page.rows,
			totalRows: page.totalRows,
			remotePage: true,
		});
	}

	searchRows(
		rows: DatabaseRow[],
		globalSearch: string,
		columns?: DatabaseViewModelColumn[],
	): DatabaseRow[] {
		const query = globalSearch.trim().toLowerCase();
		if (!query) return rows;
		const searchColumns = columns?.length ? columns : null;
		return rows.filter((row) =>
			(searchColumns ?? Object.keys(row.cells).map((columnId) => ({
				id: columnId,
				type: "text" as ColumnType,
				columnIndex: 0,
				title: columnId,
				format: undefined,
				options: undefined,
			}))).some((column) =>
				this.formatCellDisplay(
					row.cells[column.id] ?? "",
					column.type,
					column.format,
					column.options,
				)
					.toLowerCase()
					.includes(query),
			),
		);
	}

	parseCellValue(raw: string, columnType: ColumnType): unknown {
		switch (columnType) {
			case "number": {
				if (raw === "") return null;
				const value = Number(raw);
				return Number.isNaN(value) ? null : value;
			}
			case "checkbox":
				return raw.toLowerCase() === "true";
			case "date": {
				if (raw === "") return null;
				const value = new Date(raw);
				return Number.isNaN(value.getTime()) ? null : value;
			}
			case "select":
				return raw === "" ? null : raw;
			case "multiSelect":
				return parseDatabaseMultiSelectValue(raw);
			default:
				return raw;
		}
	}

	serializeCellValue(value: unknown, columnType: ColumnType): string {
		if (value == null) return "";
		switch (columnType) {
			case "checkbox":
				return value ? "true" : "false";
			case "date":
				return value instanceof Date ? value.toISOString() : String(value);
			case "select":
				return String(value);
			case "multiSelect":
				return Array.isArray(value) ? JSON.stringify(value) : "";
			default:
				return String(value);
		}
	}

	validateCellValue(raw: string, columnType: ColumnType): string | null {
		switch (columnType) {
			case "number":
				return raw !== "" && Number.isNaN(Number(raw)) ? "Invalid number" : null;
			case "date":
				return raw !== "" && Number.isNaN(new Date(raw).getTime()) ? "Invalid date" : null;
			case "email":
				return raw !== "" && !raw.includes("@") ? "Invalid email" : null;
			case "url":
				if (raw === "") return null;
				try {
					new URL(raw);
					return null;
				} catch {
					return "Invalid URL";
				}
			default:
				return null;
		}
	}

	formatCellDisplay(
		raw: string,
		columnType: ColumnType,
		format?: NumberFormat | DateFormat,
		options?: DatabaseColumnDef["options"],
	): string {
		if (raw === "") return "";
		switch (columnType) {
			case "number": {
				const value = Number(raw);
				if (Number.isNaN(value)) return raw;
				const numberFormat = format as NumberFormat | undefined;
				if (numberFormat?.style === "currency" && numberFormat.currency) {
					return new Intl.NumberFormat(undefined, {
						style: "currency",
						currency: numberFormat.currency,
						minimumFractionDigits: numberFormat.decimals,
						maximumFractionDigits: numberFormat.decimals,
					}).format(value);
				}
				if (numberFormat?.style === "percent") {
					return new Intl.NumberFormat(undefined, {
						style: "percent",
						minimumFractionDigits: numberFormat.decimals,
						maximumFractionDigits: numberFormat.decimals,
					}).format(value);
				}
				if (numberFormat?.decimals != null) {
					return value.toFixed(numberFormat.decimals);
				}
				return String(value);
			}
			case "date": {
				const value = new Date(raw);
				if (Number.isNaN(value.getTime())) return raw;
				const dateFormat = format as DateFormat | undefined;
				const options: Intl.DateTimeFormatOptions = {
					dateStyle: dateFormat?.dateStyle ?? "medium",
				};
				if (dateFormat?.includeTime) {
					options.timeStyle = "short";
				}
				return new Intl.DateTimeFormat(undefined, options).format(value);
			}
			case "checkbox":
				return raw.toLowerCase() === "true" ? "✓" : "";
			case "select":
				return formatStoredSelectValue(raw, options);
			case "multiSelect":
				return formatStoredMultiSelectValue(raw, options);
			default:
				return raw;
		}
	}

	coerceValue(
		raw: string,
		fromType: ColumnType,
		toType: ColumnType,
		options?: DatabaseColumnDef["options"],
	): string {
		return coerceDatabaseValue(raw, fromType, toType, options);
	}

	getRowId(row: DatabaseRow): string {
		return row.id;
	}

}
