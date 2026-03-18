import type { AppPlacement } from "./block";
import type { LayoutProps } from "./layout";
import type {
  ColumnType,
  SelectOption,
  NumberFormat,
  DateFormat,
  DatabaseViewState,
} from "./database";

export interface TableRowHandle {
  readonly id: string;
  readonly index: number;
}

export interface InlineNodeDeltaInsert {
  type: string;
  props: Record<string, unknown>;
}

export interface InlineDelta {
  insert: string | InlineNodeDeltaInsert;
  attributes?: Record<string, unknown>;
}

export interface TableColumnSchema {
  id: string;
  title: string;
  type: ColumnType;
  width?: number;
  hidden?: boolean;
  pinned?: "left" | "right";
  options?: SelectOption[];
  format?: NumberFormat | DateFormat;
  readonly?: boolean;
}

export interface TableCellHandle {
  readonly id: string;
  readonly row: number;
  readonly col: number;
  textContent(): string;
  length(): number;
  inlineDeltas(): InlineDelta[];
  textDeltas(): Array<{
    insert: string;
    attributes?: Record<string, unknown>;
  }>;
}

export interface BlockHandle {
  readonly id: string;
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly index: number;

  readonly prev: BlockHandle | null;
  readonly next: BlockHandle | null;
  readonly parent: BlockHandle | null;
  readonly children: readonly BlockHandle[];

  descendants(type?: string): Iterable<BlockHandle>;
  ancestors(): Iterable<BlockHandle>;
  siblings(): Iterable<BlockHandle>;

  readonly layout: LayoutProps | null;
  readonly isLayoutChild: boolean;
  layoutParent(): BlockHandle | null;

  anchoredApps(): readonly AppHandle[];

  textContent(options?: { resolved?: boolean }): string;
  inlineDeltas(): InlineDelta[];
  textDeltas(): Array<{
    insert: string;
    attributes?: Record<string, unknown>;
  }>;
  length(): number;

  meta(namespace: string): Readonly<Record<string, unknown>> | null;

  tableRowCount(): number;
  tableColumnCount(): number;
  tableRow(row: number): TableRowHandle | null;
  tableCell(row: number, col: number): TableCellHandle | null;
  tableColumns(): readonly TableColumnSchema[];
  databaseViews(): readonly DatabaseViewState[];
  databasePrimaryViewId(): string | null;
  databaseActiveView(): DatabaseViewState | null;
}

export interface AppHandle {
  readonly id: string;
  readonly type: string;
  readonly placement: AppPlacement;
  readonly config: Readonly<Record<string, unknown>>;
  readonly anchorBlock: BlockHandle | null;
}
