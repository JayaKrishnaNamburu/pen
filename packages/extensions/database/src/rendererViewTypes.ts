import type React from "react";
import type {
	DatabaseColumnDef,
	DatabaseRow,
	DatabaseRowGroup,
	DatabaseViewModelColumn,
	DatabaseViewModelRow,
	DatabaseViewState,
} from "./types";
import type { ColumnStickyStyle } from "./utils/databaseRenderer";

export type RowSectionOptions = {
	sectionLabel?: string;
};

export type CellPointerHandler = (
	event: React.MouseEvent<HTMLElement>,
	row: DatabaseViewModelRow,
	column: DatabaseViewModelColumn,
) => void;

export type DatabaseViewBodyProps = {
	blockId: string;
	viewType: DatabaseViewState["type"];
	ctxSelected: boolean | undefined;
	headerRow: React.ReactElement;
	tableColumnSpan: number;
	columns: DatabaseViewModelColumn[];
	allRows: DatabaseRow[];
	rows: DatabaseViewModelRow[];
	pinnedTopRows: DatabaseViewModelRow[];
	pinnedBottomRows: DatabaseViewModelRow[];
	rowGroups: DatabaseRowGroup[];
	rowSelection: Record<string, boolean>;
	showRowSelectionControls: boolean;
	isDataReadonly: boolean;
	isRemote: boolean;
	defaultColumnWidth: number;
	pinnedOffsets: Record<string, { left?: number; right?: number }>;
	getColumnStickyStyle: (
		column: DatabaseViewModelColumn,
		pinnedOffsets: Record<string, { left?: number; right?: number }>,
		defaultColumnWidth: number,
		section: "header" | "body",
	) => ColumnStickyStyle;
	isCellSelected: (row: number, column: number) => boolean;
	formatRemoteCell: (
		row: DatabaseViewModelRow,
		column: DatabaseViewModelColumn,
	) => string;
	onToggleRow: (rowId: string) => void;
	onRowSelectionKeyDown: (
		event: React.KeyboardEvent<HTMLInputElement>,
		rowId: string,
	) => void;
	onCellMouseDown: CellPointerHandler;
	onCellDoubleClick: CellPointerHandler;
	addListRow: React.ReactNode;
	addRowControl: React.ReactNode;
	addColumnControl: React.ReactNode;
	calendarMonth: Date;
	onShiftCalendarMonth: (amount: number) => void;
	calendarDateColumn: DatabaseColumnDef | undefined;
};
