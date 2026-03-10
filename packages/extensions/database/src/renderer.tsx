import type { BlockHandle, BlockRenderContext, CellSelection } from "@pen/core";
import {
	DATA_ATTRS,
	useEditorContext,
	useFieldEditorContext,
	useFieldEditorState,
	useSelection,
} from "@pen/react";
import { generateId } from "@pen/types";
import React, { useEffect, useMemo, useState } from "react";
import { DatabaseCellContent } from "./cellEditors";
import { DatabaseEngine } from "./engine";
import {
	ColumnMenu,
	ColumnVisibilityPanel,
	FilterPanel,
	GroupPanel,
	SortPanel,
} from "./rendererPanels";
import { DatabaseViewBody } from "./rendererViews";
import type {
	ColumnType,
	DatabaseColumnDef,
	DatabaseDataProvider,
	DatabasePage,
	DatabaseRow,
	DatabaseViewModelColumn,
	DatabaseViewModelRow,
	DatabaseViewState,
	FacetBucket,
	FilterGroup,
} from "./types";
import { isCellInSelection } from "./utils";
import {
	buildCalendarMonthData,
	CALENDAR_WEEKDAY_LABELS,
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
const ROW_SELECT_COLUMN_WIDTH = 44;

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

function DatabaseRendererInner(props: { block: BlockHandle; ctx: BlockRenderContext }) {
	const { block, ctx } = props;
	const { editor, readonly } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const editorSelection = useSelection(editor);
	const provider = editor.internals.getSlot(DATABASE_DATA_PROVIDER_SLOT) as DatabaseDataProvider | undefined;
	const engine = useMemo(() => {
		const nextEngine = new DatabaseEngine(editor, block.id);
		if (provider) {
			nextEngine.setDataProvider(provider);
		}
		return nextEngine;
	}, [editor, block.id, provider]);
	const activeView = block.databaseActiveView();
	const serializedActiveView = JSON.stringify(activeView ?? null);
	const initialView = engine.deriveViewState();
	const [viewState, setViewState] = useState<DatabaseViewState>(initialView);
	const [globalSearch, setGlobalSearch] = useState("");
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

	const fieldEditorActiveCell = fieldEditorState.activeCellCoord;
	const cellSelection =
		editorSelection?.type === "cell" && editorSelection.blockId === block.id
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

	function createDatabaseCellSelection(
		anchor: { row: number; col: number },
		head: { row: number; col: number } = anchor,
	): CellSelection {
		return {
			type: "cell",
			blockId: block.id,
			anchor,
			head,
			rowIds: visibleRowIds,
			columnIds: visibleSelectionColumnIds,
		};
	}

	function findVisibleCellCoordByIds(
		rowId: string | null,
		columnId: string | null,
	): { row: number; col: number } | null {
		if (!rowId || !columnId) {
			return null;
		}
		const row = visibleRows.findIndex((entry) => entry.id === rowId);
		const col = columns.findIndex((entry) => entry.id === columnId);
		if (row < 0 || col < 0) {
			return null;
		}
		return { row, col };
	}

	function findVisibleCellCoordByStorage(
		row: number,
		col: number,
	): { row: number; col: number } | null {
		const rowIndex = visibleRows.findIndex(
			(entry) => entry.crdtRowIndex === row,
		);
		const colIndex = columns.findIndex(
			(entry) => entry.columnIndex === col,
		);
		if (rowIndex < 0 || colIndex < 0) {
			return null;
		}
		return { row: rowIndex, col: colIndex };
	}

	function normalizeDatabaseCellSelection(
		selection: CellSelection,
	): CellSelection | null {
		if (columns.length === 0) {
			return null;
		}
		if (visibleRows.length === 0) {
			return {
				type: "cell",
				blockId: block.id,
				anchor: selection.anchor,
				head: selection.head,
			};
		}

		const firstVisibleCell = { row: 0, col: 0 };
		const anchorCoord =
			findVisibleCellCoordByIds(
				selection.rowIds?.[selection.anchor.row] ?? null,
				selection.columnIds?.[selection.anchor.col] ?? null,
			) ??
			findVisibleCellCoordByStorage(
				selection.anchor.row,
				selection.anchor.col,
			) ??
			firstVisibleCell;
		const headCoord =
			findVisibleCellCoordByIds(
				selection.rowIds?.[selection.head.row] ?? null,
				selection.columnIds?.[selection.head.col] ?? null,
			) ??
			findVisibleCellCoordByStorage(
				selection.head.row,
				selection.head.col,
			) ??
			anchorCoord;

		return createDatabaseCellSelection(anchorCoord, headCoord);
	}

	function areSelectionAxesEqual(
		left: string[] | undefined,
		right: string[],
	): boolean {
		if (!left || left.length !== right.length) {
			return false;
		}
		return left.every((value, index) => value === right[index]);
	}

	function isDatabaseSelectionCurrent(selection: CellSelection): boolean {
		if (visibleRows.length === 0) {
			return !selection.rowIds && !selection.columnIds;
		}

		return (
			areSelectionAxesEqual(selection.rowIds, visibleRowIds) &&
			areSelectionAxesEqual(selection.columnIds, visibleSelectionColumnIds)
		);
	}

	function updateViewState(patch: Partial<Omit<DatabaseViewState, "id">>) {
		const nextView = {
			...viewState,
			...patch,
		};
		setViewState(nextView);
		editor.apply([
			{
				type: "database-update-view",
				blockId: block.id,
				viewId: block.databasePrimaryViewId() ?? undefined,
				patch,
			},
		], { origin: "user" });
	}

	function handleTitleClick() {
		if (isUiReadonly) return;
		setIsEditingTitle(true);
	}

	function handleTitleBlur(event: React.FocusEvent<HTMLInputElement>) {
		setIsEditingTitle(false);
		const nextTitle = event.currentTarget.value.trim() || "Untitled";
		if (nextTitle === title) return;
		editor.apply([
			{
				type: "update-block",
				blockId: block.id,
				props: { title: nextTitle },
			},
		]);
	}

	function handleTitleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Enter" || event.key === "Escape") {
			event.currentTarget.blur();
		}
	}

	function handleCellMouseDown(
		event: React.MouseEvent<HTMLElement>,
		row: DatabaseViewModelRow,
		column: DatabaseViewModelColumn,
	) {
		if (!fieldEditor) return;
		const isEditing =
			fieldEditorActiveCell?.blockId === block.id
			&& fieldEditorActiveCell.row === row.crdtRowIndex
			&& fieldEditorActiveCell.col === column.columnIndex;
		if (isEditing) return;
		const nextCoord = findVisibleCellCoordByIds(row.id, column.id);
		if (!nextCoord) return;
		event.preventDefault();
		event.stopPropagation();
		event.nativeEvent.stopImmediatePropagation?.();
		const isSameSingleCellSelection =
			cellSelection &&
			cellSelection.anchor.row === nextCoord.row &&
			cellSelection.anchor.col === nextCoord.col &&
			cellSelection.head.row === nextCoord.row &&
			cellSelection.head.col === nextCoord.col;
		if (!event.shiftKey && isSameSingleCellSelection) {
			editor.selectBlock(block.id);
			return;
		}
		if (event.shiftKey && cellSelection) {
			editor.setSelection(
				createDatabaseCellSelection(cellSelection.anchor, nextCoord),
			);
			return;
		}
		editor.setSelection(createDatabaseCellSelection(nextCoord));
	}

	function handleCellDoubleClick(
		event: React.MouseEvent<HTMLElement>,
		row: DatabaseViewModelRow,
		column: DatabaseViewModelColumn,
	) {
		if (isDataReadonly || !fieldEditor) return;
		event.preventDefault();
		event.stopPropagation();
		event.nativeEvent.stopImmediatePropagation?.();
		const cellSurface = event.currentTarget.querySelector(`[${DATA_ATTRS.fieldEditorSurface}]`) as HTMLElement | null;
		if (cellSurface) {
			fieldEditor.activateCellFromElement?.(block.id, row.crdtRowIndex, column.columnIndex, cellSurface)
				?? fieldEditor.activateCell?.(block.id, row.crdtRowIndex, column.columnIndex);
			return;
		}
		fieldEditor.activateCell?.(block.id, row.crdtRowIndex, column.columnIndex);
	}

	function handleHeaderClick(event: React.MouseEvent<HTMLTableCellElement>, columnId: string) {
		const nextSort = getNextSortState(viewState.sort ?? [], columnId, event.shiftKey);
		updateViewState({ sort: nextSort, pageIndex: 0 });
	}

	function handleAddRow() {
		if (isDataReadonly) return;
		editor.apply([
			{
				type: "database-insert-row",
				blockId: block.id,
				index: block.tableRowCount(),
			},
		], { origin: "user" });
	}

	function handleAddColumn() {
		if (isUiReadonly) return;
		const columnId = generateId();
		const nextColumn: DatabaseColumnDef = {
			id: columnId,
			title: "New column",
			type: "text",
		};
		editor.apply([
			{
				type: "database-add-column",
				blockId: block.id,
				column: nextColumn,
				index: block.tableColumnCount(),
				viewId: block.databasePrimaryViewId() ?? undefined,
			},
		], { origin: "user" });
	}

	function handleAddView(nextType: DatabaseViewState["type"]) {
		if (isUiReadonly) return;
		const nextViewId = generateId();
		const nextView = createDatabaseViewDefinition({
			id: nextViewId,
			type: nextType,
			columns: columnSchema,
			existingViews: databaseViews,
		});
		setViewState(nextView);
		editor.apply([
			{
				type: "database-add-view",
				blockId: block.id,
				view: nextView,
			},
			{
				type: "database-set-active-view",
				blockId: block.id,
				viewId: nextViewId,
			},
		], { origin: "user" });
		setShowAddViewMenu(false);
	}

	function handleSetActiveView(viewId: string) {
		const nextView = databaseViews.find((view) => view.id === viewId);
		if (nextView) {
			setViewState(nextView);
		}
		editor.apply([
			{
				type: "database-set-active-view",
				blockId: block.id,
				viewId,
			},
		], { origin: "user" });
	}

	function handleRemoveView(viewId: string) {
		if (isUiReadonly || databaseViews.length <= 1) return;
		const currentActiveViewId = block.databasePrimaryViewId() ?? viewState.id;
		if (currentActiveViewId === viewId) {
			const fallbackView = databaseViews.find((view) => view.id !== viewId);
			if (fallbackView) {
				setViewState(fallbackView);
			}
		}
		editor.apply([
			{
				type: "database-remove-view",
				blockId: block.id,
				viewId,
			},
		], { origin: "user" });
	}

	function handleToggleAllRows() {
		if (allVisibleSelected) {
			const nextSelection = { ...rowSelection };
			for (const rowId of visibleRowIds) {
				delete nextSelection[rowId];
			}
			setRowSelection(nextSelection);
			return;
		}
		const nextSelection = { ...rowSelection };
		for (const rowId of visibleRowIds) {
			nextSelection[rowId] = true;
		}
		setRowSelection(nextSelection);
	}

	function handleToggleRow(rowId: string) {
		setRowSelection((previous) => ({
			...previous,
			[rowId]: !previous[rowId],
		}));
	}

	function getSelectedRowIds(
		fallback?: { rowId: string; checked: boolean },
	): string[] {
		const selectedRowIds = allRows
			.filter((row) => rowSelection[row.id])
			.map((row) => row.id);
		if (
			fallback?.checked &&
			!selectedRowIds.includes(fallback.rowId)
		) {
			selectedRowIds.push(fallback.rowId);
		}
		return selectedRowIds;
	}

	function handleRowSelectionKeyDown(
		event: React.KeyboardEvent<HTMLInputElement>,
		rowId: string,
	) {
		if (event.key !== "Backspace" && event.key !== "Delete") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		deleteSelectedRows({
			rowId,
			checked: event.currentTarget.checked,
		});
	}

	function deleteSelectedRows(
		fallback?: { rowId: string; checked: boolean },
	) {
		const selectedRowIds = getSelectedRowIds(fallback);
		if (selectedRowIds.length === 0 || isDataReadonly) return;
		editor.apply([
			{
				type: "database-delete-rows",
				blockId: block.id,
				rowIds: selectedRowIds,
			},
		], { origin: "user" });
		setRowSelection({});
	}

	function handleDeleteSelectedRowsClick() {
		deleteSelectedRows();
	}

	function handlePinSelectedRows(target: "top" | "bottom" | "none") {
		const selectedRowIds = getSelectedRowIds();
		if (selectedRowIds.length === 0) {
			return;
		}
		const currentRowPinning = viewState.rowPinning;
		const nextRowPinning = getNextRowPinningState(
			currentRowPinning,
			selectedRowIds,
			target,
		);
		updateViewState({ rowPinning: nextRowPinning, pageIndex: 0 });
	}

	function handleDeleteColumn(columnId: string) {
		if (isUiReadonly) return;
		editor.apply([
			{ type: "database-remove-column", blockId: block.id, columnId },
		], { origin: "user" });
		setActiveColumnMenu(null);
	}

	function handleRenameColumn(columnId: string, nextTitle: string) {
		editor.apply([{
			type: "database-update-column",
			blockId: block.id,
			columnId,
			patch: { title: nextTitle || "Untitled" },
		}], { origin: "user" });
		setActiveColumnMenu(null);
	}

	function handleChangeColumnType(columnId: string, nextType: ColumnType) {
		const targetColumn = columnSchema.find((column) => column.id === columnId);
		if (!targetColumn || targetColumn.type === nextType) return;
		editor.apply([{
			type: "database-convert-column",
			blockId: block.id,
			columnId,
			toType: nextType,
		}], { origin: "user" });
		setActiveColumnMenu(null);
	}

	function handleToggleColumnVisibility(columnId: string) {
		const nextVisibleColumnIds = visibleColumnIdSet.has(columnId)
			? visibleColumnIds.filter((id) => id !== columnId)
			: [...visibleColumnIds, columnId];
		updateViewState({ visibleColumnIds: nextVisibleColumnIds });
	}

	function handleChangeColumnPin(
		columnId: string,
		nextPinned: "left" | "right" | undefined,
	) {
		editor.apply([{
			type: "database-update-column",
			blockId: block.id,
			columnId,
			patch: { pinned: nextPinned },
		}], { origin: "user" });
		setActiveColumnMenu(null);
	}

	function handleAddOption(columnId: string, value: string, color?: string) {
		const trimmedValue = value.trim();
		if (!trimmedValue) return;
		editor.apply([{
			type: "database-update-select-options",
			blockId: block.id,
			columnId,
			action: "add",
			option: {
				id: generateId(),
				value: trimmedValue,
				color,
			},
		}], { origin: "user" });
	}

	function handleRenameOption(columnId: string, optionId: string, value: string) {
		const trimmedValue = value.trim();
		if (!trimmedValue) return;
		editor.apply([{
			type: "database-update-select-options",
			blockId: block.id,
			columnId,
			action: "rename",
			optionId,
			value: trimmedValue,
		}], { origin: "user" });
	}

	function handleRecolorOption(columnId: string, optionId: string, color: string) {
		editor.apply([{
			type: "database-update-select-options",
			blockId: block.id,
			columnId,
			action: "recolor",
			optionId,
			color,
		}], { origin: "user" });
	}

	function handleRemoveOption(columnId: string, optionId: string) {
		editor.apply([{
			type: "database-update-select-options",
			blockId: block.id,
			columnId,
			action: "remove",
			optionId,
		}], { origin: "user" });
	}

	function handleMoveOption(columnId: string, optionId: string, direction: "up" | "down") {
		const column = columnSchema.find((entry) => entry.id === columnId);
		const currentOptions = column?.options ?? [];
		const currentIndex = currentOptions.findIndex((option) => option.id === optionId);
		if (currentIndex < 0) return;
		const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
		if (targetIndex < 0 || targetIndex >= currentOptions.length) return;
		const nextOrder = [...currentOptions.map((option) => option.id)];
		const [movedOptionId] = nextOrder.splice(currentIndex, 1);
		nextOrder.splice(targetIndex, 0, movedOptionId);
		editor.apply([{
			type: "database-update-select-options",
			blockId: block.id,
			columnId,
			action: "reorder",
			order: nextOrder,
		}], { origin: "user" });
	}

	function handleFilterGroupChange(nextFilter: FilterGroup | null) {
		updateViewState({ filter: nextFilter, pageIndex: 0 });
	}

	function handleSortChange(nextSort: NonNullable<DatabaseViewState["sort"]>) {
		updateViewState({ sort: nextSort, pageIndex: 0 });
	}

	function handleChangeGroupBy(nextGroupBy: string | null) {
		updateViewState({ groupBy: nextGroupBy, pageIndex: 0 });
	}

	function handlePreviousPage() {
		updateViewState({ pageIndex: Math.max(0, (viewState.pageIndex ?? 0) - 1) });
	}

	function handleNextPage() {
		updateViewState({ pageIndex: Math.min(pageCount - 1, (viewState.pageIndex ?? 0) + 1) });
	}

	useEffect(() => {
		setViewState(engine.deriveViewState());
	}, [engine, block.id, block.tableColumns().length, serializedActiveView]);

	useEffect(() => {
		if (!cellSelection) {
			return;
		}
		const normalizedSelection = normalizeDatabaseCellSelection(cellSelection);
		if (!normalizedSelection) {
			editor.selectBlock(block.id);
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
	}, [block.id, cellSelection, columns, editor, visibleRowIds, visibleRows, visibleSelectionColumnIds]);

	useEffect(() => {
		const controller = getOrCreateDatabaseRowSelectionController(editor);
		return controller.registerDeleteHandler(block.id, () => {
			const selectedRowIds = getSelectedRowIds();
			if (selectedRowIds.length === 0 || isDataReadonly) {
				return false;
			}
			editor.apply([
				{
					type: "database-delete-rows",
					blockId: block.id,
					rowIds: selectedRowIds,
				},
			], { origin: "user" });
			setRowSelection({});
			return true;
		});
	}, [allRows, block.id, editor, isDataReadonly, rowSelection]);

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
	}, [provider, block.id, engine.isRemote, viewState]);

	const titleContent = isEditingTitle
		? (
			<input
				className="pen-db-title-input"
				key={title}
				defaultValue={title}
				onBlur={handleTitleBlur}
				onKeyDown={handleTitleKeyDown}
				autoFocus
			/>
		)
		: (
			<span className="pen-db-title" onClick={handleTitleClick}>
				{title}
			</span>
		);

	const viewTabItems = databaseViews.map((view) => {
		const isActive = view.id === (block.databasePrimaryViewId() ?? viewState.id);
		const removeViewButton = !isUiReadonly && databaseViews.length > 1 ? (
			<button
				type="button"
				data-remove-view-id={view.id}
				className="pen-db-view-tab-remove"
				onClick={(event) => {
					event.stopPropagation();
					handleRemoveView(view.id);
				}}
			>
				×
			</button>
		) : null;
		return (
			<div key={view.id} className={`pen-db-view-tab ${isActive ? "pen-db-view-tab-active" : ""}`}>
				<button
					type="button"
					data-view-id={view.id}
					className="pen-db-view-tab-button"
					onClick={() => handleSetActiveView(view.id)}
				>
					{view.title ?? getDefaultViewTitle(view.type)}
				</button>
				{removeViewButton}
			</div>
		);
	});
	const addViewMenu = showAddViewMenu && !isUiReadonly ? (
		<div className="pen-db-add-view-menu" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
			<button type="button" onClick={() => handleAddView("table")}>New table view</button>
			<button type="button" onClick={() => handleAddView("list")}>New list view</button>
			<button type="button" onClick={() => handleAddView("board")}>New board view</button>
			<button type="button" onClick={() => handleAddView("calendar")}>New calendar view</button>
			<button type="button" onClick={() => handleAddView("gallery")}>New gallery view</button>
		</div>
	) : null;
	const viewTabs = (
		<div className="pen-db-view-tabs" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
			{viewTabItems}
			{!isUiReadonly ? (
				<button
					type="button"
					className="pen-db-add-view-btn"
					onClick={() => setShowAddViewMenu((previous) => !previous)}
				>
					+ View
				</button>
			) : null}
			{addViewMenu}
		</div>
	);

	const toolbarContent = !isUiReadonly ? (
		<div className="pen-db-toolbar" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
			<input
				className="pen-db-global-search"
				type="text"
				placeholder="Search…"
				value={globalSearch}
				onChange={(event) => {
					setGlobalSearch(event.target.value);
					updateViewState({ pageIndex: 0 });
				}}
			/>
			<button className="pen-db-toolbar-btn" onClick={() => setShowFilterPanel(!showFilterPanel)}>
				Filter
			</button>
			<button className="pen-db-toolbar-btn" onClick={() => setShowSortPanel(!showSortPanel)}>
				Sort
			</button>
			<button className="pen-db-toolbar-btn" onClick={() => setShowGroupPanel(!showGroupPanel)}>
				{viewState.groupBy ? "Grouped" : "Group"}
			</button>
			<button className="pen-db-toolbar-btn" onClick={() => setShowColumnVisibilityMenu(!showColumnVisibilityMenu)}>
				Columns
			</button>
			{hasSelectedRows ? (
				<>
					<button className="pen-db-toolbar-btn" onClick={() => handlePinSelectedRows("top")}>
						Pin top
					</button>
					<button className="pen-db-toolbar-btn" onClick={() => handlePinSelectedRows("bottom")}>
						Pin bottom
					</button>
					<button className="pen-db-toolbar-btn" onClick={() => handlePinSelectedRows("none")}>
						Unpin
					</button>
					{!isDataReadonly ? (
						<button className="pen-db-toolbar-btn pen-db-toolbar-btn-danger" onClick={handleDeleteSelectedRowsClick}>
							Delete {selectedRowCount} rows
						</button>
					) : null}
				</>
			) : null}
		</div>
	) : null;

	const headerCells = columns.map((column) => {
		const sort = viewState.sort?.find((entry) => entry.columnId === column.id);
		const sortIndex = sort ? (viewState.sort?.findIndex((entry) => entry.columnId === column.id) ?? 0) + 1 : null;
		const sortIcon = sort ? (sort.direction === "desc" ? " ↓" : " ↑") : null;
		const sortMarker = sortIndex && (viewState.sort?.length ?? 0) > 1 ? ` ${sortIndex}` : "";
		const headerCellStyle = getColumnStickyStyle(column, pinnedOffsets, defaultColumnWidth, "header");
		const columnMenu = activeColumnMenu === column.id ? (
			<ColumnMenu
				column={columnSchema.find((entry) => entry.id === column.id)}
				onClose={() => setActiveColumnMenu(null)}
				onRename={(nextTitle) => handleRenameColumn(column.id, nextTitle)}
				onChangeType={(nextType) => handleChangeColumnType(column.id, nextType)}
				onDelete={() => handleDeleteColumn(column.id)}
				onToggleVisibility={() => handleToggleColumnVisibility(column.id)}
				onChangePin={(nextPinned) => handleChangeColumnPin(column.id, nextPinned)}
				onAddOption={(value, color) => handleAddOption(column.id, value, color)}
				onRenameOption={(optionId, value) => handleRenameOption(column.id, optionId, value)}
				onRecolorOption={(optionId, color) => handleRecolorOption(column.id, optionId, color)}
				onRemoveOption={(optionId) => handleRemoveOption(column.id, optionId)}
				onMoveOption={(optionId, direction) => handleMoveOption(column.id, optionId, direction)}
			/>
		) : null;
		const menuButton = !isUiReadonly ? (
			<button
				className="pen-db-col-menu-btn"
				onClick={(event) => {
					event.stopPropagation();
					setActiveColumnMenu(activeColumnMenu === column.id ? null : column.id);
				}}
			>
				⋮
			</button>
		) : null;
		return (
			<th
				key={column.id}
				{...{
					[DATA_ATTRS.tableCell]: "",
					[DATA_ATTRS.tableCellRow]: 0,
					[DATA_ATTRS.tableCellCol]: column.columnIndex,
				}}
				style={headerCellStyle}
				onClick={(event) => handleHeaderClick(event, column.id)}
			>
				<span className="pen-db-header-label">{column.title}{sortIcon}{sortMarker}</span>
				{menuButton}
				{columnMenu}
			</th>
		);
	});

	const headerRow = (
		<tr data-pen-table-row="" data-row="header">
			{showRowSelectionControls ? (
				<th
					className="pen-db-row-select-header"
					{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
					style={getFixedEdgeStyle("left", 0, ROW_SELECT_COLUMN_WIDTH, "header")}
				>
					<input type="checkbox" checked={allVisibleSelected} onChange={handleToggleAllRows} />
				</th>
			) : null}
			{headerCells}
		</tr>
	);

	const tableColumnSpan = columns.length + (showRowSelectionControls ? 1 : 0);
	const activeCalendarMonth =
		calendarMonth ?? inferCalendarMonth(allRows, calendarDateColumn?.id ?? null);
	const addListRow = !isDataReadonly ? (
		<div
			className="pen-db-list-add-row"
			{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
			onClick={handleAddRow}
		>
			<span>+ New row</span>
		</div>
	) : null;

	function handleControlMouseDown(event: React.MouseEvent<HTMLButtonElement>) {
		event.preventDefault();
		event.stopPropagation();
	}

	const addColumnControl = isUiReadonly ? null : (
		<button
			type="button"
			className="pen-table-add-column-control"
			aria-label="Add column"
			{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
			onMouseDown={handleControlMouseDown}
			onClick={handleAddColumn}
		>
			<span>+</span>
		</button>
	);

	const addRowControl = isDataReadonly ? null : (
		<button
			type="button"
			className="pen-table-add-row-control"
			aria-label="Add row"
			{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
			onMouseDown={handleControlMouseDown}
			onClick={handleAddRow}
		>
			<span>+</span>
		</button>
	);
	const bodyContent = (
		<DatabaseViewBody
			blockId={block.id}
			viewType={viewState.type}
			ctxSelected={ctx.selected}
			headerRow={headerRow}
			tableColumnSpan={tableColumnSpan}
			columns={columns}
			allRows={allRows}
			rows={rows}
			pinnedTopRows={pinnedTopRows}
			pinnedBottomRows={pinnedBottomRows}
			rowGroups={rowGroups}
			rowSelection={rowSelection}
			showRowSelectionControls={showRowSelectionControls}
			isDataReadonly={isDataReadonly}
			isRemote={engine.isRemote}
			defaultColumnWidth={defaultColumnWidth}
			pinnedOffsets={pinnedOffsets}
			getColumnStickyStyle={getColumnStickyStyle}
			isCellSelected={(row, column) =>
				!!(
					cellSelection &&
					isCellInSelection(cellSelection, row, column, {
						rowId: visibleRows.find((entry) => entry.crdtRowIndex === row)?.id,
						columnId: columns.find((entry) => entry.columnIndex === column)?.id,
					})
				)
			}
			formatRemoteCell={(row, column) =>
				engine.formatCellDisplay(
					row.cells[column.id] ?? "",
					column.type,
					column.format,
					column.options,
				)
			}
			onToggleRow={handleToggleRow}
			onRowSelectionKeyDown={handleRowSelectionKeyDown}
			onCellMouseDown={handleCellMouseDown}
			onCellDoubleClick={handleCellDoubleClick}
			addListRow={addListRow}
			addRowControl={addRowControl}
			addColumnControl={addColumnControl}
			calendarMonth={activeCalendarMonth}
			onShiftCalendarMonth={(amount) =>
				setCalendarMonth(shiftMonth(activeCalendarMonth, amount))
			}
			calendarDateColumn={calendarDateColumn}
		/>
	);

	const filterPanel = showFilterPanel && !isUiReadonly ? (
		<FilterPanel
			columnSchema={columnSchema}
			filterGroup={filterGroup}
			facetBucketsByColumnId={facetBucketsByColumnId}
			onChange={handleFilterGroupChange}
			onClose={() => setShowFilterPanel(false)}
		/>
	) : null;
	const sortPanel = showSortPanel && !isUiReadonly ? (
		<SortPanel
			columnSchema={columnSchema}
			sorts={viewState.sort ?? []}
			onChange={handleSortChange}
			onClose={() => setShowSortPanel(false)}
		/>
	) : null;

	const columnVisibilityPanel = showColumnVisibilityMenu && !isUiReadonly ? (
		<ColumnVisibilityPanel
			columnSchema={columnSchema}
			visibleColumnIds={visibleColumnIdSet}
			onToggle={handleToggleColumnVisibility}
			onClose={() => setShowColumnVisibilityMenu(false)}
		/>
	) : null;

	const groupPanel = showGroupPanel && !isUiReadonly ? (
		<GroupPanel
			columnSchema={columnSchema}
			groupBy={viewState.groupBy ?? null}
			onChange={handleChangeGroupBy}
			onClose={() => setShowGroupPanel(false)}
		/>
	) : null;

	const pagination = showPagination ? (
		<div className="pen-db-pagination" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
			<button onClick={handlePreviousPage} disabled={(viewState.pageIndex ?? 0) <= 0}>◀</button>
			<span>Page {(viewState.pageIndex ?? 0) + 1} of {pageCount}</span>
			<button onClick={handleNextPage} disabled={(viewState.pageIndex ?? 0) >= pageCount - 1}>▶</button>
		</div>
	) : null;

	const loadingIndicator = remoteLoading ? (
		<div className="pen-db-loading" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>Loading…</div>
	) : null;

	const errorIndicator = remoteError ? (
		<div className="pen-db-error" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>{remoteError}</div>
	) : null;

	return (
		<div ref={ctx.ref as React.Ref<HTMLDivElement>} data-block-type="database" data-selected={ctx.selected || undefined} className="pen-database">
			<div className="pen-db-title-bar" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
				{titleContent}
				{viewTabs}
			</div>
			{toolbarContent}
			{sortPanel}
			{filterPanel}
			{groupPanel}
			{columnVisibilityPanel}
			{loadingIndicator}
			{errorIndicator}
			{bodyContent}
			{pagination}
		</div>
	);
}

export function DatabaseRenderer(block: BlockHandle, ctx: BlockRenderContext): React.ReactElement {
	return <DatabaseRendererInner block={block} ctx={ctx} />;
}
