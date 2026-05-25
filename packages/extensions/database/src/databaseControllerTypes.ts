import type { BlockHandle, CellSelection } from "@pen/types";
import type React from "react";
import type { DatabaseEngine } from "./engine";
import type {
	getColumnStickyStyle,
	getFixedEdgeStyle,
} from "./utils/databaseRenderer";
import type {
	ColumnType,
	DatabaseColumnDef,
	DatabasePage,
	DatabaseViewModel,
	DatabaseViewModelColumn,
	DatabaseViewModelRow,
	DatabaseViewState,
	FacetBucket,
	FilterGroup,
} from "./types";

export type CellPointerHandler = (
	event: React.MouseEvent<HTMLElement>,
	row: DatabaseViewModelRow,
	column: DatabaseViewModelColumn,
) => void;

export interface DatabaseControllerConfig {
	blockId: string;
}

export interface DatabaseController {
	block: BlockHandle;
	engine: DatabaseEngine;
	viewModel: DatabaseViewModel;
	columnSchema: DatabaseColumnDef[];

	viewState: DatabaseViewState;
	updateViewState: (patch: Partial<Omit<DatabaseViewState, "id">>) => void;
	views: readonly DatabaseViewState[];

	title: string;
	isEditingTitle: boolean;
	setIsEditingTitle: (editing: boolean) => void;
	handleTitleClick: () => void;
	handleTitleBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
	handleTitleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;

	addRow: () => void;
	addColumn: () => void;
	deleteColumn: (columnId: string) => void;
	renameColumn: (columnId: string, title: string) => void;
	changeColumnType: (columnId: string, type: ColumnType) => void;
	toggleColumnVisibility: (columnId: string) => void;
	changeColumnPin: (columnId: string, pinned: "left" | "right" | undefined) => void;
	addOption: (columnId: string, value: string, color?: string) => void;
	renameOption: (columnId: string, optionId: string, value: string) => void;
	recolorOption: (columnId: string, optionId: string, color: string) => void;
	removeOption: (columnId: string, optionId: string) => void;
	moveOption: (columnId: string, optionId: string, direction: "up" | "down") => void;

	addView: (type: DatabaseViewState["type"]) => void;
	setActiveView: (viewId: string) => void;
	removeView: (viewId: string) => void;
	showAddViewMenu: boolean;
	setShowAddViewMenu: (show: boolean) => void;

	rowSelection: Record<string, boolean>;
	toggleRow: (rowId: string) => void;
	toggleAllRows: () => void;
	deleteSelectedRows: () => void;
	pinSelectedRows: (target: "top" | "bottom" | "none") => void;
	handleRowSelectionKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, rowId: string) => void;
	hasSelectedRows: boolean;
	selectedRowCount: number;
	allVisibleSelected: boolean;

	cellSelection: CellSelection | null;
	createCellSelection: (anchor: { row: number; col: number }, head?: { row: number; col: number }) => CellSelection;
	handleCellMouseDown: CellPointerHandler;
	handleCellDoubleClick: CellPointerHandler;

	globalSearch: string;
	setGlobalSearch: (value: string) => void;

	filterGroup: FilterGroup;
	handleFilterGroupChange: (filter: FilterGroup | null) => void;
	facetBucketsByColumnId: Record<string, FacetBucket[]>;
	showFilterPanel: boolean;
	setShowFilterPanel: (show: boolean) => void;

	handleSortChange: (sort: NonNullable<DatabaseViewState["sort"]>) => void;
	handleHeaderClick: (event: React.MouseEvent<HTMLTableCellElement>, columnId: string) => void;
	showSortPanel: boolean;
	setShowSortPanel: (show: boolean) => void;

	handleChangeGroupBy: (groupBy: string | null) => void;
	showGroupPanel: boolean;
	setShowGroupPanel: (show: boolean) => void;

	showColumnVisibilityMenu: boolean;
	setShowColumnVisibilityMenu: (show: boolean) => void;

	activeColumnMenu: string | null;
	setActiveColumnMenu: (columnId: string | null) => void;

	handlePreviousPage: () => void;
	handleNextPage: () => void;
	pageCount: number;
	showPagination: boolean;

	remoteLoading: boolean;
	remoteError: string | null;

	isUiReadonly: boolean;
	isDataReadonly: boolean;
	showRowSelectionControls: boolean;

	columns: DatabaseViewModelColumn[];
	allRows: DatabaseViewModelRow[];
	rows: DatabaseViewModelRow[];
	pinnedTopRows: DatabaseViewModelRow[];
	pinnedBottomRows: DatabaseViewModelRow[];
	rowGroups: DatabaseViewModel["rowGroups"];
	visibleRows: DatabaseViewModelRow[];
	visibleColumnIds: string[];
	visibleColumnIdSet: ReadonlySet<string>;

	defaultColumnWidth: number;
	pinnedOffsets: Record<string, { left?: number; right?: number }>;
	getColumnStickyStyle: typeof getColumnStickyStyle;
	getFixedEdgeStyle: typeof getFixedEdgeStyle;
	isCellSelected: (row: number, column: number) => boolean;
	formatRemoteCell: (row: DatabaseViewModelRow, column: DatabaseViewModelColumn) => string;

	calendarMonth: Date;
	shiftCalendarMonth: (amount: number) => void;
	calendarDateColumn: DatabaseColumnDef | undefined;
}
