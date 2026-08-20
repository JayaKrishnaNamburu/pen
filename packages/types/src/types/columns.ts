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
