import type {
	ColumnType,
	SelectOption,
	NumberFormat,
	DateFormat,
	TableColumnSchema,
	DatabaseSort,
	DatabaseQuery,
	DatabaseRowPinning,
	FilterGroup,
	FilterCondition,
	FilterOperator,
	DatabaseViewState,
} from "@pen/types";
import { DEFAULT_DATABASE_COLUMN_WIDTH } from "@pen/types";

export type {
	ColumnType,
	SelectOption,
	NumberFormat,
	DateFormat,
	DatabaseSort,
	DatabaseQuery,
	DatabaseRowPinning,
	FilterGroup,
	FilterCondition,
	FilterOperator,
	DatabaseViewState,
};
export { DEFAULT_DATABASE_COLUMN_WIDTH };

export type DatabaseColumnDef = TableColumnSchema;

export interface DatabaseRow {
	id: string;
	crdtRowIndex: number;
	cells: Record<string, string>;
}

export interface DatabaseDataProvider {
	fetch(query: DatabaseQuery): Promise<DatabasePage>;
	subscribe?(query: DatabaseQuery, callback: (page: DatabasePage) => void): () => void;
	mutate?(op: DatabaseMutationOp): Promise<void>;
}

export interface DatabasePage {
	rows: DatabaseRow[];
	totalRows: number;
	pageIndex: number;
	pageSize: number;
}

export interface DatabaseMutationOp {
	type: string;
	[key: string]: unknown;
}

export const CONTENTEDITABLE_COLUMN_TYPES = new Set<ColumnType>([
	"text",
	"number",
	"url",
	"email",
]);

export const DEFAULT_COLUMNS: DatabaseColumnDef[] = [
	{ id: "name", title: "Name", type: "text" },
	{ id: "tags", title: "Tags", type: "select", options: [] },
	{ id: "status", title: "Done", type: "checkbox" },
];

export interface DatabaseViewModelColumn {
	id: string;
	title: string;
	type: ColumnType;
	columnIndex: number;
	width?: number;
	hidden?: boolean;
	pinned?: "left" | "right";
	options?: SelectOption[];
	format?: NumberFormat | DateFormat;
	readonly?: boolean;
}

export interface DatabaseViewModelRow {
	id: string;
	crdtRowIndex: number;
	cells: Record<string, string>;
}

export interface DatabaseRowGroup {
	key: string;
	label: string;
	rows: DatabaseViewModelRow[];
}

export interface FacetBucket {
	value: string;
	label: string;
	count: number;
}

export interface DatabaseViewModel {
	view: DatabaseViewState;
	columns: DatabaseViewModelColumn[];
	allRows: DatabaseRow[];
	pinnedTopRows: DatabaseViewModelRow[];
	rows: DatabaseViewModelRow[];
	pinnedBottomRows: DatabaseViewModelRow[];
	rowGroups: DatabaseRowGroup[];
	totalRows: number;
	pageIndex: number;
	pageSize: number;
	pageCount: number;
}

export function isContentEditableColumnType(type: ColumnType | string | undefined): boolean {
	if (!type) return true;
	return CONTENTEDITABLE_COLUMN_TYPES.has(type as ColumnType);
}
