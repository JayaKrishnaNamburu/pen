import { DATA_ATTRS } from "@pen/react";
import { useEffect, useState } from "react";
import type {
	DatabaseColumnDef,
	FacetBucket,
	FilterCondition,
	FilterGroup,
	FilterOperator,
} from "./types";
import {
	addFilterNodeAtPath,
	createDefaultFilterCondition,
	DATE_RELATIVE_FILTER_OPTIONS,
	dateFilterNeedsValue,
	defaultOperatorFor,
	getDateFilterRangeValue,
	getDateFilterSingleValue,
	getDefaultFilterValue,
	getDefaultFilterValueForOperator,
	getFilterPathKey,
	operatorNeedsValue,
	operatorOptionsFor,
	removeFilterNodeAtPath,
	updateFilterConditionAtPath,
	updateFilterGroupOperatorAtPath,
} from "./utils/databaseRenderer";

type FilterNode = FilterCondition | FilterGroup;
type FilterPath = number[];
export function FilterPanel(props: {
	columnSchema: DatabaseColumnDef[];
	filterGroup: FilterGroup;
	facetBucketsByColumnId: Record<string, FacetBucket[]>;
	onChange: (filter: FilterGroup | null) => void;
	onClose: () => void;
}) {
	const { columnSchema, filterGroup, facetBucketsByColumnId, onChange, onClose } =
		props;

	const rootEditor = (
		<FilterGroupEditor
			columnSchema={columnSchema}
			facetBucketsByColumnId={facetBucketsByColumnId}
			rootFilterGroup={filterGroup}
			group={filterGroup}
			groupPath={[]}
			isRoot
			onChange={onChange}
		/>
	);

	return (
		<div className="pen-db-filter-panel" {...{ [DATA_ATTRS.ignorePointerGesture]: "" }}>
			<div className="pen-db-filter-header">
				<span>Filters</span>
				<button onClick={onClose}>×</button>
			</div>
			{rootEditor}
		</div>
	);
}

function FilterGroupEditor(props: {
	columnSchema: DatabaseColumnDef[];
	facetBucketsByColumnId: Record<string, FacetBucket[]>;
	rootFilterGroup: FilterGroup;
	group: FilterGroup;
	groupPath: FilterPath;
	isRoot?: boolean;
	onChange: (filter: FilterGroup | null) => void;
}) {
	const {
		columnSchema,
		facetBucketsByColumnId,
		rootFilterGroup,
		group,
		groupPath,
		isRoot = false,
		onChange,
	} = props;

	const groupPathKey = getFilterPathKey(groupPath);

	function handleGroupOperatorChange(operator: FilterGroup["operator"]) {
		const nextFilter = updateFilterGroupOperatorAtPath(
			rootFilterGroup,
			groupPath,
			operator,
		);
		onChange(nextFilter.conditions.length > 0 ? nextFilter : null);
	}

	function handleAddCondition() {
		const nextFilter = addFilterNodeAtPath(
			rootFilterGroup,
			groupPath,
			createDefaultFilterCondition(columnSchema),
		);
		onChange(nextFilter);
	}

	function handleAddGroup() {
		const nextFilter = addFilterNodeAtPath(rootFilterGroup, groupPath, {
			operator: "and",
			conditions: [createDefaultFilterCondition(columnSchema)],
		});
		onChange(nextFilter);
	}

	function handleRemoveGroup() {
		if (groupPath.length === 0) {
			onChange(null);
			return;
		}
		const nextFilter = removeFilterNodeAtPath(rootFilterGroup, groupPath);
		onChange(nextFilter.conditions.length > 0 ? nextFilter : null);
	}

	const childItems = group.conditions.map((condition, index) => {
		const childPath = [...groupPath, index];
		if (isFilterGroupNode(condition)) {
			return (
				<FilterGroupEditor
					key={getFilterPathKey(childPath)}
					columnSchema={columnSchema}
					facetBucketsByColumnId={facetBucketsByColumnId}
					rootFilterGroup={rootFilterGroup}
					group={condition}
					groupPath={childPath}
					onChange={onChange}
				/>
			);
		}
		return (
			<FilterConditionRow
				key={getFilterPathKey(childPath)}
				columnSchema={columnSchema}
				condition={condition}
				conditionPath={childPath}
				facetBucketsByColumnId={facetBucketsByColumnId}
				rootFilterGroup={rootFilterGroup}
				onChange={onChange}
			/>
		);
	});

	return (
		<div className="pen-db-filter-group" data-filter-group-path={groupPathKey}>
			<div className="pen-db-filter-group-header">
				<select
					data-filter-group-operator={groupPathKey}
					value={group.operator}
					onChange={(event) =>
						handleGroupOperatorChange(event.target.value as FilterGroup["operator"])
					}
				>
					<option value="and">AND</option>
					<option value="or">OR</option>
				</select>
				{!isRoot ? (
					<button
						data-filter-remove-group={groupPathKey}
						onClick={handleRemoveGroup}
					>
						×
					</button>
				) : null}
			</div>
			{childItems}
			<div className="pen-db-filter-group-actions">
				<button
					className={isRoot ? "pen-db-filter-add" : "pen-db-filter-add-condition"}
					data-filter-add-condition={groupPathKey}
					onClick={handleAddCondition}
				>
					+ Add filter
				</button>
				<button
					className="pen-db-filter-add-group"
					data-filter-add-group={groupPathKey}
					onClick={handleAddGroup}
				>
					+ Add filter group
				</button>
			</div>
		</div>
	);
}

function FilterConditionRow(props: {
	columnSchema: DatabaseColumnDef[];
	condition: FilterCondition;
	conditionPath: FilterPath;
	facetBucketsByColumnId: Record<string, FacetBucket[]>;
	rootFilterGroup: FilterGroup;
	onChange: (filter: FilterGroup | null) => void;
}) {
	const {
		columnSchema,
		condition,
		conditionPath,
		facetBucketsByColumnId,
		rootFilterGroup,
		onChange,
	} = props;

	const conditionPathKey = getFilterPathKey(conditionPath);
	const column =
		columnSchema.find((entry) => entry.id === condition.columnId) ?? columnSchema[0];
	const operatorOptions = operatorOptionsFor(column?.type ?? "text");
	const facetBuckets = facetBucketsByColumnId[condition.columnId] ?? [];
	const datalistId = `pen-db-filter-values-${conditionPathKey}`;

	const columnOptionItems = columnSchema.map((columnItem) => (
		<option key={columnItem.id} value={columnItem.id}>
			{columnItem.title}
		</option>
	));
	const operatorOptionItems = operatorOptions.map((option) => (
		<option key={option.value} value={option.value}>
			{option.label}
		</option>
	));
	const facetOptionItems = facetBuckets.map((bucket) => (
		<option key={bucket.value} value={bucket.value} label={`${bucket.label} (${bucket.count})`}>
			{bucket.label} ({bucket.count})
		</option>
	));

	function handleUpdateCondition(patch: Partial<FilterCondition>) {
		const nextFilter = updateFilterConditionAtPath(
			rootFilterGroup,
			conditionPath,
			patch,
		);
		onChange(nextFilter.conditions.length > 0 ? nextFilter : null);
	}

	function handleRemoveCondition() {
		const nextFilter = removeFilterNodeAtPath(rootFilterGroup, conditionPath);
		onChange(nextFilter.conditions.length > 0 ? nextFilter : null);
	}

	function handleDateRangeChange(index: 0 | 1, nextValue: string) {
		const currentValue = Array.isArray(condition.value)
			? condition.value
			: ["", ""];
		const nextRangeValue: string[] = [...currentValue];
		nextRangeValue[index] = nextValue;
		handleUpdateCondition({ value: nextRangeValue });
	}

	const checkboxValueControl = (
		<select
			data-filter-value={conditionPathKey}
			value={condition.operator === "is_unchecked" ? "unchecked" : "checked"}
			onChange={(event) => {
				handleUpdateCondition({
					operator:
						event.target.value === "unchecked"
							? "is_unchecked"
							: "is_checked",
					value: null,
				});
			}}
		>
			<option value="checked">Checked</option>
			<option value="unchecked">Unchecked</option>
		</select>
	);
	const relativeOptionItems = DATE_RELATIVE_FILTER_OPTIONS.map((option) => (
		<option key={option.value} value={option.value}>
			{option.label}
		</option>
	));
	const dateValueControl = !dateFilterNeedsValue(condition.operator) ? null : condition.operator === "is_relative" ? (
		<select
			data-filter-value={conditionPathKey}
			value={typeof condition.value === "string" ? condition.value : "today"}
			onChange={(event) => handleUpdateCondition({ value: event.target.value })}
		>
			{relativeOptionItems}
		</select>
	) : condition.operator === "is_between" ? (
		<div className="pen-db-filter-date-range">
			<input
				data-filter-value-start={conditionPathKey}
				type="date"
				value={getDateFilterRangeValue(condition.value, 0)}
				onChange={(event) => handleDateRangeChange(0, event.target.value)}
			/>
			<span>to</span>
			<input
				data-filter-value-end={conditionPathKey}
				type="date"
				value={getDateFilterRangeValue(condition.value, 1)}
				onChange={(event) => handleDateRangeChange(1, event.target.value)}
			/>
		</div>
	) : (
		<input
			data-filter-value={conditionPathKey}
			type="date"
			value={getDateFilterSingleValue(condition.value)}
			onChange={(event) => handleUpdateCondition({ value: event.target.value })}
		/>
	);
	const textValueControl = (
		<>
			<input
				data-filter-value={conditionPathKey}
				type="text"
				list={facetBuckets.length > 0 ? datalistId : undefined}
				value={typeof condition.value === "string" ? condition.value : ""}
				onChange={(event) => handleUpdateCondition({ value: event.target.value })}
				placeholder="Filter value…"
			/>
			{facetBuckets.length > 0 ? (
				<datalist id={datalistId}>{facetOptionItems}</datalist>
			) : null}
		</>
	);
	const valueControl =
		column?.type === "checkbox"
			? checkboxValueControl
			: column?.type === "date"
				? dateValueControl
				: operatorNeedsValue(condition.operator)
					? textValueControl
					: null;

	return (
		<div className="pen-db-filter-row" data-filter-condition-path={conditionPathKey}>
			<select
				data-filter-column={conditionPathKey}
				value={condition.columnId}
				onChange={(event) => {
					const nextColumn = columnSchema.find(
						(entry) => entry.id === event.target.value,
					);
					handleUpdateCondition({
						columnId: event.target.value,
						operator: defaultOperatorFor(nextColumn?.type ?? "text"),
						value: getDefaultFilterValue(nextColumn?.type ?? "text"),
					});
				}}
			>
				{columnOptionItems}
			</select>
			<select
				data-filter-operator={conditionPathKey}
				value={condition.operator}
				onChange={(event) =>
					handleUpdateCondition({
						operator: event.target.value as FilterOperator,
						value: getDefaultFilterValueForOperator(
							column?.type ?? "text",
							event.target.value as FilterOperator,
						),
					})
				}
			>
				{operatorOptionItems}
			</select>
			{valueControl}
			<button data-filter-remove={conditionPathKey} onClick={handleRemoveCondition}>
				×
			</button>
		</div>
	);
}
function isFilterGroupNode(value: FilterNode): value is FilterGroup {
	return "conditions" in value;
}
