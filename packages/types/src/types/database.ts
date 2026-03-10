export type ColumnType =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "multiSelect"
  | "date"
  | "url"
  | "email"
  | "relation"
  | "formula";

export const DEFAULT_DATABASE_COLUMN_WIDTH = 150;

export interface SelectOption {
  id: string;
  value: string;
  color?: string;
  label?: string;
}

export interface NumberFormat {
  style: "plain" | "currency" | "percent";
  decimals?: number;
  currency?: string;
}

export interface DateFormat {
  includeTime?: boolean;
  dateStyle?: "short" | "medium" | "long";
}

export interface DatabaseSort {
  columnId: string;
  direction: "asc" | "desc";
}

export type FilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "is_checked"
  | "is_unchecked"
  | "is_any_of"
  | "is_none_of"
  | "is_before"
  | "is_after"
  | "is_between"
  | "is_relative";

export interface FilterCondition {
  columnId: string;
  operator: FilterOperator;
  value: string | string[] | null;
}

export interface FilterGroup {
  operator: "and" | "or";
  conditions: (FilterCondition | FilterGroup)[];
}

export interface DatabaseRowPinning {
  top?: string[];
  bottom?: string[];
}

export interface DatabaseViewState {
  id: string;
  title?: string;
  type: "table" | "board" | "calendar" | "gallery" | "list";
  visibleColumnIds?: string[];
  columnOrder?: string[];
  sort?: DatabaseSort[];
  filter?: FilterGroup | null;
  groupBy?: string | null;
  rowPinning?: DatabaseRowPinning;
  pageIndex?: number;
  pageSize?: number;
}

export interface DatabaseQuery {
  sort?: DatabaseSort[];
  filter?: FilterGroup;
  groupBy?: string | null;
  pageIndex?: number;
  pageSize?: number;
}
