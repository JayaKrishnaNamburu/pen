import { DATA_ATTRS } from "@pen/react";
import type { DatabaseColumnDef, DatabaseViewState } from "./types";

export { ColumnMenu } from "./rendererColumnMenu";
export { FilterPanel } from "./rendererFilterPanel";



export function SortPanel(props: {
	columnSchema: DatabaseColumnDef[];
	sorts: NonNullable<DatabaseViewState["sort"]>;
	onChange: (sorts: NonNullable<DatabaseViewState["sort"]>) => void;
	onClose: () => void;
}) {
	const { columnSchema, sorts, onChange, onClose } = props;

	function handleAddSort() {
		const firstColumn = columnSchema[0];
		if (!firstColumn) {
			return;
		}
		onChange([
			...sorts,
			{
				columnId: firstColumn.id,
				direction: "asc",
			},
		]);
	}

	function handleUpdateSort(
		index: number,
		patch: Partial<NonNullable<DatabaseViewState["sort"]>[number]>,
	) {
		const nextSorts = sorts.map((sort, sortIndex) =>
			sortIndex === index ? { ...sort, ...patch } : sort,
		);
		onChange(nextSorts);
	}

	function handleRemoveSort(index: number) {
		onChange(sorts.filter((_, sortIndex) => sortIndex !== index));
	}

	function handleMoveSort(index: number, direction: "up" | "down") {
		const targetIndex = direction === "up" ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= sorts.length) {
			return;
		}
		const nextSorts = [...sorts];
		const [movedSort] = nextSorts.splice(index, 1);
		nextSorts.splice(targetIndex, 0, movedSort);
		onChange(nextSorts);
	}

	const columnOptionItems = columnSchema.map((column) => (
		<option key={column.id} value={column.id}>
			{column.title}
		</option>
	));
	const sortRows = sorts.map((sort, index) => (
		<div key={`${sort.columnId}:${index}`} className="pen-db-sort-row" data-sort-row={index}>
			<select
				data-sort-column={index}
				value={sort.columnId}
				onChange={(event) =>
					handleUpdateSort(index, { columnId: event.target.value })
				}
			>
				{columnOptionItems}
			</select>
			<select
				data-sort-direction={index}
				value={sort.direction}
				onChange={(event) =>
					handleUpdateSort(index, {
						direction: event.target.value as "asc" | "desc",
					})
				}
			>
				<option value="asc">Ascending</option>
				<option value="desc">Descending</option>
			</select>
			<button
				data-sort-move-up={index}
				onClick={() => handleMoveSort(index, "up")}
				disabled={index === 0}
			>
				↑
			</button>
			<button
				data-sort-move-down={index}
				onClick={() => handleMoveSort(index, "down")}
				disabled={index === sorts.length - 1}
			>
				↓
			</button>
			<button data-sort-remove={index} onClick={() => handleRemoveSort(index)}>
				×
			</button>
		</div>
	));

	return (
		<div className="pen-db-filter-panel" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
			<div className="pen-db-filter-header">
				<span>Sort</span>
				<button onClick={onClose}>×</button>
			</div>
			{sortRows}
			<button className="pen-db-sort-add" onClick={handleAddSort}>
				+ Add sort
			</button>
		</div>
	);
}


export function ColumnVisibilityPanel(props: {
	columnSchema: DatabaseColumnDef[];
	visibleColumnIds: ReadonlySet<string>;
	onToggle: (columnId: string) => void;
	onClose: () => void;
}) {
	const { columnSchema, visibleColumnIds, onToggle, onClose } = props;

	const items = columnSchema.map((column) => (
		<label key={column.id} className="pen-db-col-vis-item">
			<input
				type="checkbox"
				checked={visibleColumnIds.has(column.id)}
				onChange={() => onToggle(column.id)}
			/>
			{column.title}
		</label>
	));

	return (
		<div className="pen-db-col-vis-panel" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
			<div className="pen-db-col-vis-header">
				<span>Columns</span>
				<button onClick={onClose}>×</button>
			</div>
			{items}
		</div>
	);
}

export function GroupPanel(props: {
	columnSchema: DatabaseColumnDef[];
	groupBy: string | null;
	onChange: (columnId: string | null) => void;
	onClose: () => void;
}) {
	const { columnSchema, groupBy, onChange, onClose } = props;

	const groupOptionItems = [
		<option key="none" value="">
			No grouping
		</option>,
		...columnSchema.map((column) => (
			<option key={column.id} value={column.id}>
				{column.title}
			</option>
		)),
	];

	return (
		<div className="pen-db-col-vis-panel" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
			<div className="pen-db-col-vis-header">
				<span>Group rows</span>
				<button onClick={onClose}>×</button>
			</div>
			<select value={groupBy ?? ""} onChange={(event) => onChange(event.target.value || null)}>
				{groupOptionItems}
			</select>
		</div>
	);
}

