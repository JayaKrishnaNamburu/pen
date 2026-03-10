import type {
  DatabaseViewState,
  DocumentOp,
  ImportOptions,
  Position,
  TableColumnSchema,
} from "@pen/types";
import { generateId } from "@pen/types";

export type { ImportOptions } from "@pen/types";

export interface ImportedDatabaseData {
  columns: TableColumnSchema[];
  rows: Array<{ id: string; values: Record<string, string> }>;
  views?: DatabaseViewState[];
  primaryViewId?: string | null;
}

export interface PendingBlock {
  type: string;
  props: Record<string, unknown>;
  content?: string;
  marks?: Array<{
    type: string;
    props?: Record<string, unknown>;
    start: number;
    end: number;
  }>;
  children?: PendingBlock[];
  database?: ImportedDatabaseData;
}

/**
 * Converts PendingBlock[] into DocumentOp[] suitable for editor.apply().
 * Shared across @pen/import-markdown and @pen/import-html.
 *
 * For each block: emits insert-block, then insert-text (if content),
 * then format-text ops for each mark range. This correctly handles
 * overlapping marks (e.g. bold [0-10] with italic [3-7]).
 *
 * Table blocks with __table_row / __table_cell children are materialized
 * into insert-table-row + insert-table-cell-text ops so that the canonical
 * tableContent structure is populated through the apply pipeline.
 */
export function blocksToOps(
  blocks: PendingBlock[],
  options?: ImportOptions,
): DocumentOp[] {
  const ops: DocumentOp[] = [];
  let position: Position = options?.position ?? "last";

  for (const block of blocks) {
    if (block.type.startsWith("__table")) continue;

    const blockId = generateId();

    ops.push({
      type: "insert-block",
      blockId,
      blockType: block.type,
      props: cleanProps(block.props),
      position,
    });

    if (block.type === "database" && block.database) {
      materializeDatabaseBlock(ops, blockId, block.database);
    } else if (block.type === "table" && block.children) {
      materializeTableChildren(ops, blockId, block.children);
    } else {
      if (block.content) {
        ops.push({
          type: "insert-text",
          blockId,
          offset: 0,
          text: block.content,
        });

        for (const mark of block.marks ?? []) {
          if (mark.start >= mark.end) continue;
          ops.push({
            type: "format-text",
            blockId,
            offset: mark.start,
            length: mark.end - mark.start,
            marks: { [mark.type]: mark.props ?? true },
          });
        }
      }

      if (block.children) {
        for (let i = 0; i < block.children.length; i++) {
          const child = block.children[i];
          const childOps = blocksToOps([child], {
            position: { parent: blockId, index: i },
          });
          ops.push(...childOps);
        }
      }
    }

    position = { after: blockId };
  }

  return ops;
}

function materializeDatabaseBlock(
  ops: DocumentOp[],
  blockId: string,
  database: ImportedDatabaseData,
): void {
  if (database.columns.length > 0) {
    ops.push({
      type: "update-table-columns",
      blockId,
      columns: database.columns,
    } as DocumentOp);
  }

  for (let rowIndex = 0; rowIndex < database.rows.length; rowIndex++) {
    const row = database.rows[rowIndex]!;
    ops.push({
      type: "database-insert-row",
      blockId,
      index: rowIndex,
      rowId: row.id,
      values: row.values,
    } as DocumentOp);
  }

  if (database.views && database.views.length > 0) {
    const [firstView, ...remainingViews] = database.views;
    ops.push({
		type: "database-update-view",
      blockId,
      patch: firstView,
    } as DocumentOp);

    for (const view of remainingViews) {
      ops.push({
        type: "database-add-view",
        blockId,
        view,
      } as DocumentOp);
    }
  }

  if (database.primaryViewId) {
    ops.push({
      type: "database-set-active-view",
      blockId,
      viewId: database.primaryViewId,
    } as DocumentOp);
  }
}

function materializeTableChildren(
  ops: DocumentOp[],
  blockId: string,
  rows: PendingBlock[],
): void {
  const tableRows = rows.filter((r) => r.type === "__table_row");

  const SEED_ROWS = 2;
  const SEED_COLS = 2;
  const desiredRowCount = Math.max(tableRows.length, 1);
  const desiredColCount = Math.max(
    tableRows.reduce((max, row) => {
      const cellCount = (row.children ?? []).filter(
        (cell) => cell.type === "__table_cell",
      ).length;
      return Math.max(max, cellCount);
    }, 0),
    1,
  );

  for (let rowIdx = SEED_ROWS - 1; rowIdx >= desiredRowCount; rowIdx--) {
    ops.push({
      type: "delete-table-row",
      blockId,
      index: rowIdx,
    } as DocumentOp);
  }

  for (let colIdx = SEED_COLS - 1; colIdx >= desiredColCount; colIdx--) {
    ops.push({
      type: "delete-table-column",
      blockId,
      index: colIdx,
    } as DocumentOp);
  }

  for (let colIdx = SEED_COLS; colIdx < desiredColCount; colIdx++) {
    ops.push({
      type: "insert-table-column",
      blockId,
      index: colIdx,
    } as DocumentOp);
  }

  for (let rowIdx = 0; rowIdx < tableRows.length; rowIdx++) {
    const row = tableRows[rowIdx];
    const cells = (row.children ?? []).filter(
      (c) => c.type === "__table_cell",
    );

    if (rowIdx >= SEED_ROWS) {
      ops.push({
        type: "insert-table-row",
        blockId,
        index: rowIdx,
      } as DocumentOp);
    }

    for (let colIdx = 0; colIdx < cells.length; colIdx++) {
      const cell = cells[colIdx];

      if (cell.content) {
        ops.push({
          type: "insert-table-cell-text",
          blockId,
          row: rowIdx,
          col: colIdx,
          offset: 0,
          text: cell.content,
        } as DocumentOp);

        for (const mark of cell.marks ?? []) {
          if (mark.start >= mark.end) continue;
          ops.push({
            type: "format-table-cell-text",
            blockId,
            row: rowIdx,
            col: colIdx,
            offset: mark.start,
            length: mark.end - mark.start,
            marks: { [mark.type]: mark.props ?? true },
          } as DocumentOp);
        }
      }
    }
  }
}

function cleanProps(props: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}
