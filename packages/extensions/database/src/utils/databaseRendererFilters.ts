import type {
	ColumnType,
	DatabaseColumnDef,
	DatabaseViewState,
	FilterCondition,
	FilterGroup,
	FilterOperator,
} from "../types";

export const DATE_RELATIVE_FILTER_OPTIONS = [
	{ value: "today", label: "Today" },
	{ value: "yesterday", label: "Yesterday" },
	{ value: "tomorrow", label: "Tomorrow" },
	{ value: "this_week", label: "This week" },
	{ value: "last_7_days", label: "Last 7 days" },
	{ value: "next_7_days", label: "Next 7 days" },
	{ value: "this_month", label: "This month" },
] as const;
type FilterNode = FilterCondition | FilterGroup;
type FilterPath = number[];
export function createDefaultFilterCondition(
	columnSchema: DatabaseColumnDef[],
): FilterCondition {
	const firstColumn = columnSchema[0];
	if (!firstColumn) {
		return {
			columnId: "",
			operator: "contains",
			value: "",
		};
	}
	return {
		columnId: firstColumn.id,
		operator: defaultOperatorFor(firstColumn.type),
		value: getDefaultFilterValue(firstColumn.type),
	};
}

export function getDefaultFilterValue(
	columnType: ColumnType,
): FilterCondition["value"] {
	return getDefaultFilterValueForOperator(
		columnType,
		defaultOperatorFor(columnType),
	);
}

export function getDefaultFilterValueForOperator(
	columnType: ColumnType,
	operator: FilterOperator,
): FilterCondition["value"] {
	if (!operatorNeedsValue(operator)) {
		return null;
	}
	if (columnType === "date") {
		if (operator === "is_between") {
			return ["", ""];
		}
		if (operator === "is_relative") {
			return DATE_RELATIVE_FILTER_OPTIONS[0]?.value ?? "today";
		}
	}
	return "";
}

export function operatorNeedsValue(operator: FilterOperator): boolean {
	return ![
		"is_empty",
		"is_not_empty",
		"is_checked",
		"is_unchecked",
	].includes(operator);
}

export function dateFilterNeedsValue(operator: FilterOperator): boolean {
	return operatorNeedsValue(operator);
}

export function getDateFilterSingleValue(
	value: FilterCondition["value"],
): string {
	return typeof value === "string" ? value : "";
}

export function getDateFilterRangeValue(
	value: FilterCondition["value"],
	index: 0 | 1,
): string {
	if (!Array.isArray(value)) {
		return "";
	}
	return value[index] ?? "";
}

export function defaultOperatorFor(columnType: ColumnType): FilterOperator {
	if (columnType === "checkbox") {
		return "is_checked";
	}
	if (columnType === "number") {
		return "=";
	}
	if (columnType === "date") {
		return "is";
	}
	if (columnType === "select") {
		return "is";
	}
	if (columnType === "multiSelect") {
		return "is_any_of";
	}
	return "contains";
}

export function operatorOptionsFor(
	columnType: ColumnType,
): Array<{ value: FilterOperator; label: string }> {
	if (columnType === "checkbox") {
		return [
			{ value: "is_checked", label: "is checked" },
			{ value: "is_unchecked", label: "is unchecked" },
		];
	}
	if (columnType === "number") {
		return [
			{ value: "=", label: "=" },
			{ value: "!=", label: "!=" },
			{ value: ">", label: ">" },
			{ value: "<", label: "<" },
			{ value: ">=", label: ">=" },
			{ value: "<=", label: "<=" },
			{ value: "is_empty", label: "is empty" },
			{ value: "is_not_empty", label: "is not empty" },
		];
	}
	if (columnType === "date") {
		return [
			{ value: "is", label: "is" },
			{ value: "is_before", label: "is before" },
			{ value: "is_after", label: "is after" },
			{ value: "is_between", label: "is between" },
			{ value: "is_relative", label: "is relative to today" },
			{ value: "is_empty", label: "is empty" },
			{ value: "is_not_empty", label: "is not empty" },
		];
	}
	if (columnType === "select") {
		return [
			{ value: "is", label: "is" },
			{ value: "is_not", label: "is not" },
			{ value: "is_any_of", label: "is any of" },
			{ value: "is_none_of", label: "is none of" },
			{ value: "is_empty", label: "is empty" },
			{ value: "is_not_empty", label: "is not empty" },
		];
	}
	if (columnType === "multiSelect") {
		return [
			{ value: "contains", label: "contains" },
			{ value: "not_contains", label: "does not contain" },
			{ value: "is_any_of", label: "is any of" },
			{ value: "is_none_of", label: "is none of" },
			{ value: "is_empty", label: "is empty" },
			{ value: "is_not_empty", label: "is not empty" },
		];
	}
	return [
		{ value: "contains", label: "contains" },
		{ value: "not_contains", label: "does not contain" },
		{ value: "is", label: "is" },
		{ value: "is_not", label: "is not" },
		{ value: "starts_with", label: "starts with" },
		{ value: "ends_with", label: "ends with" },
		{ value: "is_empty", label: "is empty" },
		{ value: "is_not_empty", label: "is not empty" },
	];
}

export function getFilterPathKey(path: number[]): string {
	return path.length > 0 ? path.join("-") : "root";
}

export function updateFilterGroupOperatorAtPath(
	root: FilterGroup,
	path: number[],
	operator: FilterGroup["operator"],
): FilterGroup {
	return updateFilterGroupAtPath(root, path, (group) => ({
		...group,
		operator,
	}));
}

export function updateFilterConditionAtPath(
	root: FilterGroup,
	path: number[],
	patch: Partial<FilterCondition>,
): FilterGroup {
	if (path.length === 0) {
		return root;
	}
	const [index, ...rest] = path;
	const nextConditions = root.conditions.map((condition, conditionIndex) => {
		if (conditionIndex !== index) {
			return condition;
		}
		if (rest.length > 0 && isFilterGroupNode(condition)) {
			return updateFilterConditionAtPath(condition, rest, patch);
		}
		if (isFilterGroupNode(condition)) {
			return condition;
		}
		return {
			...condition,
			...patch,
		};
	});
	return {
		...root,
		conditions: nextConditions,
	};
}

export function addFilterNodeAtPath(
	root: FilterGroup,
	path: number[],
	node: FilterNode,
): FilterGroup {
	return updateFilterGroupAtPath(root, path, (group) => ({
		...group,
		conditions: [...group.conditions, node],
	}));
}

export function removeFilterNodeAtPath(
	root: FilterGroup,
	path: number[],
): FilterGroup {
	if (path.length === 0) {
		return { ...root, conditions: [] };
	}
	const parentPath = path.slice(0, -1);
	const targetIndex = path[path.length - 1] ?? -1;
	return updateFilterGroupAtPath(root, parentPath, (group) => ({
		...group,
		conditions: group.conditions.filter(
			(_, conditionIndex) => conditionIndex !== targetIndex,
		),
	}));
}

function isFilterGroupNode(value: FilterNode): value is FilterGroup {
	return "conditions" in value;
}

function updateFilterGroupAtPath(
	root: FilterGroup,
	path: FilterPath,
	updater: (group: FilterGroup) => FilterGroup,
): FilterGroup {
	if (path.length === 0) {
		return updater(root);
	}
	const [index, ...rest] = path;
	const nextConditions = root.conditions.map((condition, conditionIndex) => {
		if (conditionIndex !== index || !isFilterGroupNode(condition)) {
			return condition;
		}
		return updateFilterGroupAtPath(condition, rest, updater);
	});
	return {
		...root,
		conditions: nextConditions,
	};
}

