import type { AppPlacement } from "./block.js";
import type { SelectionState } from "./selection.js";
import type { LayoutProps } from "./layout.js";

export type OpOrigin =
  | "user"
  | "ai"
  | "collaborator"
  | "extension"
  | "history"
  | "input-rule"
  | "app"
  | "import"
  | "system";

export interface ApplyOptions {
  origin?: OpOrigin;
  undoGroup?: boolean;
}

export type Position =
  | "first"
  | "last"
  | { before: string }
  | { after: string }
  | { parent: string; index: number };

// ── Document Operations ─────────────────────────────────────

export type DocumentOp =
  | InsertBlockOp
  | UpdateBlockOp
  | DeleteBlockOp
  | MoveBlockOp
  | ConvertBlockOp
  | SplitBlockOp
  | MergeBlocksOp
  | InsertTextOp
  | DeleteTextOp
  | FormatTextOp
  | ReplaceTextOp
  | InsertInlineNodeOp
  | RemoveInlineNodeOp
  | UpdateLayoutOp
  | InsertTableRowOp
  | DeleteTableRowOp
  | InsertTableColumnOp
  | DeleteTableColumnOp
  | MergeTableCellsOp
  | SplitTableCellOp
  | SetMetaOp
  | CreateAppOp
  | UpdateAppOp
  | DeleteAppOp
  | SetSelectionOp;

// ── Block ops ───────────────────────────────────────────────

export interface InsertBlockOp {
  type: "insert-block";
  blockId: string;
  blockType: string;
  props: Record<string, unknown>;
  position: Position;
}
export interface UpdateBlockOp {
  type: "update-block";
  blockId: string;
  props: Record<string, unknown>;
}
export interface DeleteBlockOp {
  type: "delete-block";
  blockId: string;
}
export interface MoveBlockOp {
  type: "move-block";
  blockId: string;
  position: Position;
}
export interface ConvertBlockOp {
  type: "convert-block";
  blockId: string;
  newType: string;
  newProps?: Record<string, unknown>;
}
export interface SplitBlockOp {
  type: "split-block";
  blockId: string;
  offset: number;
  newBlockId: string;
  newBlockType?: string;
}
export interface MergeBlocksOp {
  type: "merge-blocks";
  targetBlockId: string;
  sourceBlockId: string;
}

// ── Text ops ────────────────────────────────────────────────

export interface InsertTextOp {
  type: "insert-text";
  blockId: string;
  offset: number;
  text: string;
  marks?: Record<string, unknown | null>;
}
export interface DeleteTextOp {
  type: "delete-text";
  blockId: string;
  offset: number;
  length: number;
}
export interface FormatTextOp {
  type: "format-text";
  blockId: string;
  offset: number;
  length: number;
  marks: Record<string, unknown>;
}
export interface ReplaceTextOp {
  type: "replace-text";
  blockId: string;
  offset: number;
  length: number;
  text: string;
  marks?: Record<string, unknown | null>;
}
export interface InsertInlineNodeOp {
  type: "insert-inline-node";
  blockId: string;
  offset: number;
  nodeType: string;
  props: Record<string, unknown>;
}
export interface RemoveInlineNodeOp {
  type: "remove-inline-node";
  blockId: string;
  offset: number;
}

// ── Layout ops ──────────────────────────────────────────────

export interface UpdateLayoutOp {
  type: "update-layout";
  blockId: string;
  layout: Partial<LayoutProps>;
}

// ── Table ops ───────────────────────────────────────────────

export interface InsertTableRowOp {
  type: "insert-table-row";
  blockId: string;
  index: number;
}
export interface DeleteTableRowOp {
  type: "delete-table-row";
  blockId: string;
  index: number;
}
export interface InsertTableColumnOp {
  type: "insert-table-column";
  blockId: string;
  index: number;
}
export interface DeleteTableColumnOp {
  type: "delete-table-column";
  blockId: string;
  index: number;
}
export interface MergeTableCellsOp {
  type: "merge-table-cells";
  blockId: string;
  anchor: { row: number; col: number };
  head: { row: number; col: number };
}
export interface SplitTableCellOp {
  type: "split-table-cell";
  blockId: string;
  row: number;
  col: number;
}

// ── Meta ops ────────────────────────────────────────────────

export interface SetMetaOp {
  type: "set-meta";
  blockId: string;
  namespace: string;
  data: Record<string, unknown> | null;
}

// ── App ops ─────────────────────────────────────────────────

export interface CreateAppOp {
  type: "create-app";
  appId: string;
  appType: string;
  config: Record<string, unknown>;
  placement: AppPlacement;
}
export interface UpdateAppOp {
  type: "update-app";
  appId: string;
  patch: Record<string, unknown>;
}
export interface DeleteAppOp {
  type: "delete-app";
  appId: string;
}

// ── Selection ops ───────────────────────────────────────────

export interface SetSelectionOp {
  type: "set-selection";
  selection: SelectionState;
}
