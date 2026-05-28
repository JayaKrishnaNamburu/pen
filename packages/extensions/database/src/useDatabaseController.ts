import type { CellSelection } from "@pen/types";
import {
	DATA_ATTRS,
	useEditorContext,
	useFieldEditorContext,
	useFieldEditorState,
	useSelection,
} from "@pen/react";
import { useEffect, useMemo, useState } from "react";
import { DatabaseEngine } from "./engine";
import { createDatabaseMutationHandlers } from "./databaseControllerMutationHandlers";
import { createDatabaseSelectionHandlers } from "./databaseControllerSelectionHandlers";
import type { DatabaseController, DatabaseControllerConfig } from "./databaseControllerTypes";
export type { DatabaseController, DatabaseControllerConfig } from "./databaseControllerTypes";
import type {
	ColumnType,
	DatabaseColumnDef,
	DatabaseDataProvider,
	DatabasePage,
	DatabaseViewModel,
	DatabaseViewModelColumn,
	DatabaseViewModelRow,
	DatabaseViewState,
	FacetBucket,
	FilterGroup,
} from "./types";
import {
	createDatabaseViewDefinition,
	getCalendarDateColumn,
	getColumnStickyStyle,
	getDefaultViewTitle,
	getFixedEdgeStyle,
	getNextRowPinningState,
	getNextSortState,
	getPinnedOffsets,
	inferCalendarMonth,
	resolveDefaultColumnWidth,
	shiftMonth,
	toEditableFilterGroup,
} from "./utils/databaseRenderer";

const DATABASE_DATA_PROVIDER_SLOT = "database:data-provider";
const DATABASE_ROW_SELECTION_SLOT = "database:row-selection";

export const ROW_SELECT_COLUMN_WIDTH = 44;

export type CellPointerHandler = (
	event: React.MouseEvent<HTMLElement>,
	row: DatabaseViewModelRow,
	column: DatabaseViewModelColumn,
) => void;

type DatabaseRowSelectionController = {
	registerDeleteHandler: (
		blockId: string,
		handler: () => boolean,
	) => () => void;
	deleteSelectedRows: (blockId: string) => boolean;
};

function getOrCreateDatabaseRowSelectionController(
	editor: ReturnType<typeof useEditorContext>["editor"],
): DatabaseRowSelectionController {
	const existing = editor.internals.getSlot(
		DATABASE_ROW_SELECTION_SLOT,
	) as DatabaseRowSelectionController | undefined;
	if (existing) {
		return existing;
	}

	const handlers = new Map<string, () => boolean>();
	const controller: DatabaseRowSelectionController = {
		registerDeleteHandler(blockId, handler) {
			handlers.set(blockId, handler);
			return () => {
				if (handlers.get(blockId) === handler) {
					handlers.delete(blockId);
				}
			};
		},
		deleteSelectedRows(blockId) {
			return handlers.get(blockId)?.() ?? false;
		},
	};
	editor.internals.setSlot(DATABASE_ROW_SELECTION_SLOT, controller);
	return controller;
}


export function useDatabaseController(config: DatabaseControllerConfig): DatabaseController {
	const { blockId } = config;
	const { editor, readonly } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const editorSelection = useSelection(editor);

	const block = editor.getBlock(blockId)!;
	const provider = editor.internals.getSlot(DATABASE_DATA_PROVIDER_SLOT) as DatabaseDataProvider | undefined;
	const engine = useMemo(() => {
		const nextEngine = new DatabaseEngine(editor, blockId);
		if (provider) {
			nextEngine.setDataProvider(provider);
		}
		return nextEngine;
	}, [editor, blockId, provider]);

	const activeView = block.databaseActiveView();
	const serializedActiveView = JSON.stringify(activeView ?? null);
	const initialView = engine.deriveViewState();
	const [viewState, setViewState] = useState<DatabaseViewState>(initialView);
	const [globalSearch, setGlobalSearchRaw] = useState("");
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
	const [showSortPanel, setShowSortPanel] = useState(false);
	const [showFilterPanel, setShowFilterPanel] = useState(false);
	const [showColumnVisibilityMenu, setShowColumnVisibilityMenu] = useState(false);
	const [showGroupPanel, setShowGroupPanel] = useState(false);
	const [showAddViewMenu, setShowAddViewMenu] = useState(false);
	const [calendarMonth, setCalendarMonth] = useState<Date | null>(null);
	const [remotePage, setRemotePage] = useState<DatabasePage | null>(null);
	const [remoteLoading, setRemoteLoading] = useState(false);
	const [remoteError, setRemoteError] = useState<string | null>(null);
	const [columnSchemaRefreshToken, setColumnSchemaRefreshToken] = useState(0);

	const fieldEditorActiveCell = fieldEditorState.activeCellCoord;
	const cellSelection =
		editorSelection?.type === "cell" && editorSelection.blockId === blockId
			? editorSelection
			: null;
	const isUiReadonly = readonly;
	const isDataReadonly = readonly || engine.isRemote;
	const showRowSelectionControls = !isUiReadonly;
	const title = (block.props.title as string) || "Untitled";
	const databaseViews = block.databaseViews();
	const defaultColumnWidth = resolveDefaultColumnWidth(block.props.defaultColumnWidth);
	const columnSchema = engine.deriveColumnSchema();
	const localViewModel = engine.buildViewModel({ view: viewState, globalSearch });
	const remoteViewModel = remotePage ? engine.buildRemoteViewModel(remotePage, viewState) : null;
	const viewModel = engine.isRemote && remoteViewModel ? remoteViewModel : localViewModel;
	const columns = viewModel.columns;
	const pinnedTopRows = viewModel.pinnedTopRows;
	const rows = viewModel.rows;
	const pinnedBottomRows = viewModel.pinnedBottomRows;
	const rowGroups = viewModel.rowGroups;
	const allRows = viewModel.allRows;
	const visibleRows = useMemo(
		() =>
			rowGroups.length > 0
				? [
					...pinnedTopRows,
					...rowGroups.flatMap((group) => group.rows),
					...pinnedBottomRows,
				]
				: [...pinnedTopRows, ...rows, ...pinnedBottomRows],
		[pinnedBottomRows, pinnedTopRows, rowGroups, rows],
	);
	const pageCount = viewModel.pageCount;
	const showPagination = pageCount > 1;
	const visibleColumnIds = viewState.visibleColumnIds ?? columnSchema.filter((column) => !column.hidden).map((column) => column.id);
	const visibleColumnIdSet = new Set(visibleColumnIds);
	const calendarDateColumn = getCalendarDateColumn(columnSchema);
	const pinnedOffsets = getPinnedOffsets(columns, {
		defaultColumnWidth,
		leftBase: showRowSelectionControls ? ROW_SELECT_COLUMN_WIDTH : 0,
		rightBase: 0,
	});
	const hasSelectedRows = Object.keys(rowSelection).some((id) => rowSelection[id]);
	const selectedRowCount = Object.values(rowSelection).filter(Boolean).length;
	const visibleRowIds = visibleRows.map((row) => row.id);
	const visibleSelectionColumnIds = columns.map((column) => column.id);
	const allVisibleSelected = visibleRowIds.length > 0 && visibleRowIds.every((rowId) => rowSelection[rowId]);
	const filterGroup = toEditableFilterGroup(viewState.filter);
	const facetSourceRows = engine.searchRows(engine.deriveRowData(), globalSearch, columns);
	const facetBucketsByColumnId = Object.fromEntries(
		columnSchema.map((column) => [
			column.id,
			engine.facetColumnValues(facetSourceRows, column.id, columns),
		]),
	) as Record<string, FacetBucket[]>;

	// --- Cell selection helpers ---

	const activeCalendarMonth =
		calendarMonth ?? inferCalendarMonth(allRows, calendarDateColumn?.id ?? null);
	const mutationHandlers = createDatabaseMutationHandlers({
		activeCalendarMonth,
		allRows,
		block,
		blockId,
		calendarMonth,
		cellSelection,
		columnSchema,
		columns,
		databaseViews,
		editor,
		engine,
		globalSearch,
		isDataReadonly,
		isUiReadonly,
		pageCount,
		rowSelection,
		setActiveColumnMenu,
		setCalendarMonth,
		setColumnSchemaRefreshToken,
		setGlobalSearchRaw,
		setIsEditingTitle,
		setShowAddViewMenu,
		setViewState,
		title,
		viewState,
		visibleColumnIds,
		visibleColumnIdSet,
		visibleRows,
	});
	const {
		updateViewState,
		handleTitleClick,
		handleTitleBlur,
		handleTitleKeyDown,
		handleHeaderClick,
		handleAddRow,
		handleAddColumn,
		handleAddView,
		handleSetActiveView,
		handleRemoveView,
		handleDeleteColumn,
		handleRenameColumn,
		handleChangeColumnType,
		handleToggleColumnVisibility,
		handleChangeColumnPin,
		handleAddOption,
		handleRenameOption,
		handleRecolorOption,
		handleRemoveOption,
		handleMoveOption,
		handleFilterGroupChange,
		handleSortChange,
		handleChangeGroupBy,
		handlePreviousPage,
		handleNextPage,
		setGlobalSearch,
		isCellSelectedFn,
		formatRemoteCell,
		shiftCalendarMonthFn,
	} = mutationHandlers;
	const selectionHandlers = createDatabaseSelectionHandlers({
		allRows,
		allVisibleSelected,
		blockId,
		cellSelection,
		columns,
		editor,
		fieldEditor,
		fieldEditorActiveCell,
		isDataReadonly,
		rowSelection,
		setRowSelection,
		updateViewState,
		viewState,
		visibleRowIds,
		visibleRows,
		visibleSelectionColumnIds,
	});
	const {
		createDatabaseCellSelection,
		normalizeDatabaseCellSelection,
		isDatabaseSelectionCurrent,
		handleCellMouseDown,
		handleCellDoubleClick,
		handleToggleAllRows,
		handleToggleRow,
		getSelectedRowIds,
		handleRowSelectionKeyDown,
		handleDeleteSelectedRows,
		handlePinSelectedRows,
	} = selectionHandlers;

	// --- Effects ---

	useEffect(() => {
		setViewState(engine.deriveViewState());
	}, [engine, blockId, block.tableColumns().length, columnSchemaRefreshToken, serializedActiveView]);

	useEffect(() => {
		if (!cellSelection) {
			return;
		}
		const normalizedSelection = normalizeDatabaseCellSelection(cellSelection);
		if (!normalizedSelection) {
			editor.selectBlock(blockId);
			return;
		}
		if (
			cellSelection.anchor.row !== normalizedSelection.anchor.row ||
			cellSelection.anchor.col !== normalizedSelection.anchor.col ||
			cellSelection.head.row !== normalizedSelection.head.row ||
			cellSelection.head.col !== normalizedSelection.head.col ||
			!isDatabaseSelectionCurrent(cellSelection)
		) {
			editor.setSelection(normalizedSelection);
		}
	}, [blockId, cellSelection, columns, editor, visibleRowIds, visibleRows, visibleSelectionColumnIds]);

	useEffect(() => {
		const controller = getOrCreateDatabaseRowSelectionController(editor);
		return controller.registerDeleteHandler(blockId, () => {
			const selectedRowIds = getSelectedRowIds();
			if (selectedRowIds.length === 0 || isDataReadonly) {
				return false;
			}
			editor.apply([
				{
					type: "database-delete-rows",
					blockId,
					rowIds: selectedRowIds,
				},
			], { origin: "user" });
			setRowSelection({});
			return true;
		});
	}, [allRows, blockId, editor, isDataReadonly, rowSelection]);

	useEffect(() => {
		const rowIdSet = new Set(allRows.map((row) => row.id));
		setRowSelection((previous) => {
			const nextSelection = Object.fromEntries(
				Object.entries(previous).filter(([rowId, selected]) => selected && rowIdSet.has(rowId)),
			);
			const previousKeys = Object.keys(previous);
			const nextKeys = Object.keys(nextSelection);
			return previousKeys.length === nextKeys.length &&
				previousKeys.every((rowId) => nextSelection[rowId] === previous[rowId])
				? previous
				: nextSelection;
		});
	}, [allRows]);

	useEffect(() => {
		if (viewState.type !== "calendar") {
			return;
		}
		setCalendarMonth(inferCalendarMonth(allRows, calendarDateColumn?.id ?? null));
	}, [calendarDateColumn?.id, viewState.id, viewState.type]);

	useEffect(() => {
		if (!provider || !engine.isRemote) {
			setRemotePage(null);
			setRemoteLoading(false);
			setRemoteError(null);
			return;
		}
		const query = engine.createQuery({ view: viewState });
		let unsub: (() => void) | undefined;
		let cancelled = false;
		setRemoteLoading(true);
		setRemoteError(null);
		provider.fetch(query)
			.then((page) => {
				if (cancelled) return;
				setRemotePage(page);
				setRemoteLoading(false);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setRemoteError(error instanceof Error ? error.message : "Failed to load database rows.");
				setRemoteLoading(false);
			});
		if (provider.subscribe) {
			unsub = provider.subscribe(query, (page) => {
				if (!cancelled) {
					setRemotePage(page);
					setRemoteLoading(false);
				}
			});
		}
		return () => {
			cancelled = true;
			unsub?.();
		};
	}, [provider, blockId, engine.isRemote, viewState]);

	return {
		block,
		engine,
		viewModel,
		columnSchema,

		viewState,
		updateViewState,
		views: databaseViews,

		title,
		isEditingTitle,
		setIsEditingTitle,
		handleTitleClick,
		handleTitleBlur,
		handleTitleKeyDown,

		addRow: handleAddRow,
		addColumn: handleAddColumn,
		deleteColumn: handleDeleteColumn,
		renameColumn: handleRenameColumn,
		changeColumnType: handleChangeColumnType,
		toggleColumnVisibility: handleToggleColumnVisibility,
		changeColumnPin: handleChangeColumnPin,
		addOption: handleAddOption,
		renameOption: handleRenameOption,
		recolorOption: handleRecolorOption,
		removeOption: handleRemoveOption,
		moveOption: handleMoveOption,

		addView: handleAddView,
		setActiveView: handleSetActiveView,
		removeView: handleRemoveView,
		showAddViewMenu,
		setShowAddViewMenu,

		rowSelection,
		toggleRow: handleToggleRow,
		toggleAllRows: handleToggleAllRows,
		deleteSelectedRows: () => handleDeleteSelectedRows(),
		pinSelectedRows: handlePinSelectedRows,
		handleRowSelectionKeyDown,
		hasSelectedRows,
		selectedRowCount,
		allVisibleSelected,

		cellSelection,
		createCellSelection: createDatabaseCellSelection,
		handleCellMouseDown,
		handleCellDoubleClick,

		globalSearch,
		setGlobalSearch,

		filterGroup,
		handleFilterGroupChange,
		facetBucketsByColumnId,
		showFilterPanel,
		setShowFilterPanel,

		handleSortChange,
		handleHeaderClick,
		showSortPanel,
		setShowSortPanel,

		handleChangeGroupBy,
		showGroupPanel,
		setShowGroupPanel,

		showColumnVisibilityMenu,
		setShowColumnVisibilityMenu,

		activeColumnMenu,
		setActiveColumnMenu,

		handlePreviousPage,
		handleNextPage,
		pageCount,
		showPagination,

		remoteLoading,
		remoteError,

		isUiReadonly,
		isDataReadonly,
		showRowSelectionControls,

		columns,
		allRows,
		rows,
		pinnedTopRows,
		pinnedBottomRows,
		rowGroups,
		visibleRows,
		visibleColumnIds,
		visibleColumnIdSet,

		defaultColumnWidth,
		pinnedOffsets,
		getColumnStickyStyle,
		getFixedEdgeStyle,
		isCellSelected: isCellSelectedFn,
		formatRemoteCell,

		calendarMonth: activeCalendarMonth,
		shiftCalendarMonth: shiftCalendarMonthFn,
		calendarDateColumn,
	};
}
