import {
  createImportResult,
  normalizePendingBlocksForImport,
  reportPendingBlockImportViolations,
  type PendingBlock,
  type ImportedDatabaseData,
} from "@pen/content-ops";
import {
  generateId,
  type DocumentOp,
  type Editor,
  type Importer,
  type ImportOptions,
  type ImportResult,
  type Position,
} from "@pen/types";
import { isSupportedPenDocumentVersion } from "./schema";
import type {
  PenBlockJSON,
  PenDocumentJSON,
  PenInlineSegmentJSON,
  PenMarkJSON,
} from "./types";

export const jsonImporter: Importer<string | PenDocumentJSON, PendingBlock[]> = {
  name: "json",
  mimeType: "application/json",

  parse(input: string | PenDocumentJSON): PendingBlock[] {
    const document = parseJsonDocument(input);
    return document.blocks.map(jsonBlockToPendingBlock);
  },

  import(
    input: string | PenDocumentJSON,
    editor: Editor,
    options?: ImportOptions,
  ): ImportResult {
    const document = parseJsonDocument(input);
    const parsedBlocks = document.blocks.map(jsonBlockToPendingBlock);
    const normalized = normalizePendingBlocksForImport(
      parsedBlocks,
      editor.documentProfile,
      editor.schema,
    );

    reportPendingBlockImportViolations(
      editor,
      normalized.violations,
      "import-json:parse",
    );

    const result = createImportResult(
      parsedBlocks.length,
      normalized.blocks.length,
      normalized.violations,
    );

    if (normalized.blocks.length === 0) {
      return result;
    }

    const importOps = canReuseJsonBlockIds(document.blocks, normalized.blocks)
      ? buildOpsWithIds(normalized.blocks, document.blocks, options)
      : buildOpsWithIds(normalized.blocks, undefined, options);
    const ops = options?.replace
      ? [...buildDeleteExistingBlockOps(editor), ...importOps]
      : importOps;

    editor.apply(ops, {
      origin: "import",
      ...(options?.undoGroup === false ? {} : { undoGroup: true }),
    });

    return result;
  },
};

export function parseJsonDocument(input: string | PenDocumentJSON): PenDocumentJSON {
  const value = typeof input === "string" ? JSON.parse(input) : input;

  if (!isRecord(value)) {
    throw new Error("Invalid Pen JSON document.");
  }

  if (!isSupportedPenDocumentVersion(value.version)) {
    throw new Error("Unsupported Pen JSON document version.");
  }

  if (!Array.isArray(value.blocks)) {
    throw new Error("Invalid Pen JSON document: expected blocks array.");
  }

  return value as unknown as PenDocumentJSON;
}

function jsonBlockToPendingBlock(block: PenBlockJSON): PendingBlock {
  return {
    type: block.type,
    props: block.props ?? {},
    ...(block.content ? { content: block.content.text } : {}),
    ...(block.content?.segments
      ? { segments: block.content.segments.map(jsonInlineSegmentToPendingSegment) }
      : {}),
    ...(block.content?.marks
      ? {
          marks: block.content.marks.map((mark) => ({
            type: mark.type,
            start: mark.start,
            end: mark.end,
            ...(mark.props ? { props: mark.props } : {}),
          })),
        }
      : {}),
    ...(block.children
      ? { children: block.children.map(jsonBlockToPendingBlock) }
      : {}),
    ...(block.database ? { database: block.database as ImportedDatabaseData } : {}),
  };
}

function jsonInlineSegmentToPendingSegment(segment: PenInlineSegmentJSON) {
  if (segment.type === "text") {
    return {
      type: "text" as const,
      text: segment.text,
      ...(segment.attributes ? { attributes: segment.attributes } : {}),
    };
  }

  return {
    type: "node" as const,
    nodeType: segment.nodeType,
    ...(segment.props ? { props: segment.props } : {}),
  };
}

function buildOpsWithIds(
  blocks: PendingBlock[],
  idBlocks?: PenBlockJSON[],
  options?: ImportOptions,
): DocumentOp[] {
  const ops: DocumentOp[] = [];
  let position: Position = options?.position ?? "last";

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.type.startsWith("__table")) {
      continue;
    }

    const idBlock = idBlocks?.[index];
    const blockId = idBlock?.id ?? generateId();

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
      materializeInlineContent(ops, blockId, block);

      if (block.children) {
        const childIdBlocks = idBlock?.children;
        for (let childIndex = 0; childIndex < block.children.length; childIndex += 1) {
          const child = block.children[childIndex]!;
          const childOps = buildOpsWithIds([child], childIdBlocks?.[childIndex] ? [childIdBlocks[childIndex]!] : undefined, {
            position: { parent: blockId, index: childIndex },
          });
          ops.push(...childOps);
        }
      }
    }

    position = { after: blockId };
  }

  return ops;
}

function buildDeleteExistingBlockOps(editor: Editor): DocumentOp[] {
  return [...editor.documentState.allBlocks()]
    .filter((handle) => handle.parent === null)
    .reverse()
    .map((handle) => ({
      type: "delete-block",
      blockId: handle.id,
    }));
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

  for (let rowIndex = 0; rowIndex < database.rows.length; rowIndex += 1) {
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
  const tableRows = rows.filter((row) => row.type === "__table_row");
  const seedRows = 2;
  const seedCols = 2;
  const desiredRowCount = Math.max(tableRows.length, 1);
  const desiredColCount = Math.max(
    tableRows.reduce((max, row) => {
      const cellCount = (row.children ?? []).filter(
        (cell: PendingBlock) => cell.type === "__table_cell",
      ).length;
      return Math.max(max, cellCount);
    }, 0),
    1,
  );

  for (let rowIdx = seedRows - 1; rowIdx >= desiredRowCount; rowIdx -= 1) {
    ops.push({
      type: "delete-table-row",
      blockId,
      index: rowIdx,
    } as DocumentOp);
  }

  for (let colIdx = seedCols - 1; colIdx >= desiredColCount; colIdx -= 1) {
    ops.push({
      type: "delete-table-column",
      blockId,
      index: colIdx,
    } as DocumentOp);
  }

  for (let colIdx = seedCols; colIdx < desiredColCount; colIdx += 1) {
    ops.push({
      type: "insert-table-column",
      blockId,
      index: colIdx,
    } as DocumentOp);
  }

  for (let rowIdx = 0; rowIdx < tableRows.length; rowIdx += 1) {
    const row = tableRows[rowIdx]!;
    const cells = (row.children ?? []).filter(
      (cell: PendingBlock) => cell.type === "__table_cell",
    );

    if (rowIdx >= seedRows) {
      ops.push({
        type: "insert-table-row",
        blockId,
        index: rowIdx,
      } as DocumentOp);
    }

    for (let colIdx = 0; colIdx < cells.length; colIdx += 1) {
      const cell = cells[colIdx]!;

      materializeTableCellContent(ops, blockId, rowIdx, colIdx, cell);
    }
  }
}

function materializeInlineContent(
  ops: DocumentOp[],
  blockId: string,
  block: PendingBlock,
): void {
  if (block.segments && block.segments.length > 0) {
    let offset = 0;
    for (const segment of block.segments) {
      if (segment.type === "text") {
        if (segment.text.length === 0) {
          continue;
        }
        ops.push({
          type: "insert-text",
          blockId,
          offset,
          text: segment.text,
        });
        if (segment.attributes) {
          ops.push({
            type: "format-text",
            blockId,
            offset,
            length: segment.text.length,
            marks: segment.attributes,
          });
        }
        offset += segment.text.length;
        continue;
      }

      ops.push({
        type: "insert-inline-node",
        blockId,
        offset,
        nodeType: segment.nodeType,
        props: segment.props ?? {},
      });
      offset += 1;
    }
    return;
  }

  if (!block.content) {
    return;
  }

  ops.push({
    type: "insert-text",
    blockId,
    offset: 0,
    text: block.content,
  });

  for (const mark of block.marks ?? []) {
    if (mark.start >= mark.end) {
      continue;
    }

    ops.push({
      type: "format-text",
      blockId,
      offset: mark.start,
      length: mark.end - mark.start,
      marks: { [mark.type]: mark.props ?? true },
    });
  }
}

function materializeTableCellContent(
  ops: DocumentOp[],
  blockId: string,
  row: number,
  col: number,
  cell: PendingBlock,
): void {
  if (!cell.content) {
    return;
  }

  ops.push({
    type: "insert-table-cell-text",
    blockId,
    row,
    col,
    offset: 0,
    text: cell.content,
  } as DocumentOp);

  for (const mark of cell.marks ?? []) {
    if (mark.start >= mark.end) {
      continue;
    }

    ops.push({
      type: "format-table-cell-text",
      blockId,
      row,
      col,
      offset: mark.start,
      length: mark.end - mark.start,
      marks: { [mark.type]: mark.props ?? true },
    } as DocumentOp);
  }
}

function canReuseJsonBlockIds(
  originalBlocks: PenBlockJSON[],
  normalizedBlocks: PendingBlock[],
): boolean {
  if (originalBlocks.length !== normalizedBlocks.length) {
    return false;
  }

  for (let index = 0; index < originalBlocks.length; index += 1) {
    const original = originalBlocks[index]!;
    const normalized = normalizedBlocks[index]!;

    if (original.type !== normalized.type) {
      return false;
    }

    if ((original.children?.length ?? 0) !== (normalized.children?.length ?? 0)) {
      return false;
    }

    if (
      original.children &&
      normalized.children &&
      !canReuseJsonBlockIds(original.children, normalized.children)
    ) {
      return false;
    }
  }

  return true;
}

function cleanProps(props: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
