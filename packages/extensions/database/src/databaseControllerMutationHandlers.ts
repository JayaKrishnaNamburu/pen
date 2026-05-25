import type React from "react";
import { generateId } from "@pen/types";
import type { ColumnType, DatabaseColumnDef, DatabaseViewModelColumn, DatabaseViewModelRow, DatabaseViewState, FilterGroup } from "./types";
import { isCellInSelection } from "./utils";
import {
	createDatabaseViewDefinition,
	getNextSortState,
	shiftMonth,
} from "./utils/databaseRenderer";

type MutationHandlerContext = Record<string, any>;

export function createDatabaseMutationHandlers(context: MutationHandlerContext) {
	const {
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
	} = context;

	function updateViewState(patch: Partial<Omit<DatabaseViewState, "id">>) {
		const nextView = {
			...viewState,
			...patch,
		};
		setViewState(nextView);
		editor.apply([
			{
				type: "database-update-view",
				blockId,
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
				blockId,
				props: { title: nextTitle },
			},
		]);
	}

	function handleTitleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Enter" || event.key === "Escape") {
			event.currentTarget.blur();
		}
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
				blockId,
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
				blockId,
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
				blockId,
				view: nextView,
			},
			{
				type: "database-set-active-view",
				blockId,
				viewId: nextViewId,
			},
		], { origin: "user" });
		setShowAddViewMenu(false);
	}

	function handleSetActiveView(viewId: string) {
		const nextView = databaseViews.find((view: DatabaseViewState) => view.id === viewId);
		if (nextView) {
			setViewState(nextView);
		}
		editor.apply([
			{
				type: "database-set-active-view",
				blockId,
				viewId,
			},
		], { origin: "user" });
	}

	function handleRemoveView(viewId: string) {
		if (isUiReadonly || databaseViews.length <= 1) return;
		const currentActiveViewId = block.databasePrimaryViewId() ?? viewState.id;
		if (currentActiveViewId === viewId) {
			const fallbackView = databaseViews.find((view: DatabaseViewState) => view.id !== viewId);
			if (fallbackView) {
				setViewState(fallbackView);
			}
		}
		editor.apply([
			{
				type: "database-remove-view",
				blockId,
				viewId,
			},
		], { origin: "user" });
	}
	function handleDeleteColumn(columnId: string) {
		if (isUiReadonly) return;
		editor.apply([
			{ type: "database-remove-column", blockId, columnId },
		], { origin: "user" });
		setActiveColumnMenu(null);
	}

	function handleRenameColumn(columnId: string, nextTitle: string) {
		editor.apply([{
			type: "database-update-column",
			blockId,
			columnId,
			patch: { title: nextTitle || "Untitled" },
		}], { origin: "user" });
		setActiveColumnMenu(null);
	}

	function handleChangeColumnType(columnId: string, nextType: ColumnType) {
		const targetColumn = columnSchema.find((column: DatabaseColumnDef) => column.id === columnId);
		if (!targetColumn || targetColumn.type === nextType) return;
		editor.apply([{
			type: "database-convert-column",
			blockId,
			columnId,
			toType: nextType,
		}], { origin: "user" });
		setActiveColumnMenu(null);
	}

	function handleToggleColumnVisibility(columnId: string) {
		const nextVisibleColumnIds = visibleColumnIdSet.has(columnId)
			? visibleColumnIds.filter((id: string) => id !== columnId)
			: [...visibleColumnIds, columnId];
		updateViewState({ visibleColumnIds: nextVisibleColumnIds });
	}

	function handleChangeColumnPin(
		columnId: string,
		nextPinned: "left" | "right" | undefined,
	) {
		editor.apply([{
			type: "database-update-column",
			blockId,
			columnId,
			patch: { pinned: nextPinned },
		}], { origin: "user" });
		setActiveColumnMenu(null);
	}

	function refreshColumnSchemaSoon() {
		requestAnimationFrame(() => {
			setColumnSchemaRefreshToken((value: number) => value + 1);
		});
	}

	function handleAddOption(columnId: string, value: string, color?: string) {
		const trimmedValue = value.trim();
		if (!trimmedValue) return;
		editor.apply([{
			type: "database-update-select-options",
			blockId,
			columnId,
			action: "add",
			option: {
				id: generateId(),
				value: trimmedValue,
				color,
			},
		}], { origin: "user" });
		refreshColumnSchemaSoon();
	}

	function handleRenameOption(columnId: string, optionId: string, value: string) {
		const trimmedValue = value.trim();
		if (!trimmedValue) return;
		editor.apply([{
			type: "database-update-select-options",
			blockId,
			columnId,
			action: "rename",
			optionId,
			value: trimmedValue,
		}], { origin: "user" });
		refreshColumnSchemaSoon();
	}

	function handleRecolorOption(columnId: string, optionId: string, color: string) {
		editor.apply([{
			type: "database-update-select-options",
			blockId,
			columnId,
			action: "recolor",
			optionId,
			color,
		}], { origin: "user" });
		refreshColumnSchemaSoon();
	}

	function handleRemoveOption(columnId: string, optionId: string) {
		editor.apply([{
			type: "database-update-select-options",
			blockId,
			columnId,
			action: "remove",
			optionId,
		}], { origin: "user" });
		refreshColumnSchemaSoon();
	}

	function handleMoveOption(columnId: string, optionId: string, direction: "up" | "down") {
		const column = columnSchema.find((entry: DatabaseColumnDef) => entry.id === columnId);
		const currentOptions = column?.options ?? [];
		const currentIndex = currentOptions.findIndex((option: NonNullable<DatabaseColumnDef["options"]>[number]) => option.id === optionId);
		if (currentIndex < 0) return;
		const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
		if (targetIndex < 0 || targetIndex >= currentOptions.length) return;
		const nextOrder = [...currentOptions.map((option: NonNullable<DatabaseColumnDef["options"]>[number]) => option.id)];
		const [movedOptionId] = nextOrder.splice(currentIndex, 1);
		nextOrder.splice(targetIndex, 0, movedOptionId);
		editor.apply([{
			type: "database-update-select-options",
			blockId,
			columnId,
			action: "reorder",
			order: nextOrder,
		}], { origin: "user" });
		refreshColumnSchemaSoon();
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

	function setGlobalSearch(value: string) {
		setGlobalSearchRaw(value);
		updateViewState({ pageIndex: 0 });
	}
	function isCellSelectedFn(row: number, column: number): boolean {
		return !!(
			cellSelection &&
			isCellInSelection(cellSelection, row, column, {
				rowId: visibleRows.find((entry: DatabaseViewModelRow) => entry.crdtRowIndex === row)?.id,
				columnId: columns.find((entry: DatabaseViewModelColumn) => entry.columnIndex === column)?.id,
			})
		);
	}

	function formatRemoteCell(row: DatabaseViewModelRow, column: DatabaseViewModelColumn): string {
		return engine.formatCellDisplay(
			row.cells[column.id] ?? "",
			column.type,
			column.format,
			column.options,
		);
	}
	function shiftCalendarMonthFn(amount: number) {
		setCalendarMonth(shiftMonth(activeCalendarMonth, amount));
	}

	return {
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
	};
}
