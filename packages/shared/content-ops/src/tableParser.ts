import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { InlineMark, MdastTable, PendingBlock } from "./markdownTypes";
import { processInlineNodes } from "./inlineMarks";

export function parseTable(
  tableNode: MdastTable,
  databasePayload?: {
    title?: string;
    dataSource?: string;
    columns: TableColumnSchema[];
    rows: Array<{ id: string; values: Record<string, string> }>;
    views?: DatabaseViewState[];
    primaryViewId?: string | null;
  } | null,
): PendingBlock {
  if (databasePayload) {
    return {
      type: "database",
      props: {
        title:
          typeof databasePayload.title === "string"
            ? databasePayload.title
            : "Untitled",
        dataSource:
          databasePayload.dataSource === "remote" ||
          databasePayload.dataSource === "hybrid"
            ? databasePayload.dataSource
            : "local",
      },
      database: {
        columns: databasePayload.columns,
        rows: databasePayload.rows,
        views: databasePayload.views,
        primaryViewId: databasePayload.primaryViewId ?? null,
      },
    };
  }

  const hasHeaderRow =
    tableNode.children.length > 0 &&
    tableNode.children[0]?.type === "tableRow";

  const rows: Array<Array<{ text: string; marks: InlineMark[] }>> = [];

  for (const row of tableNode.children) {
    const cells: Array<{ text: string; marks: InlineMark[] }> = [];
    for (const cell of row.children) {
      const ctx = { text: "", marks: [] as InlineMark[], offset: 0 };
      processInlineNodes(cell.children ?? [], ctx);
      cells.push({ text: ctx.text, marks: ctx.marks });
    }
    rows.push(cells);
  }

  return {
    type: "table",
    props: {
      hasHeaderRow,
      hasHeaderColumn: false,
    },
    content: undefined,
    children: rows.map((row, rowIndex) => ({
      type: "__table_row",
      props: { _rowIndex: rowIndex },
      children: row.map((cell, colIndex) => ({
        type: "__table_cell",
        props: { _rowIndex: rowIndex, _colIndex: colIndex },
        content: cell.text,
        marks: cell.marks,
      })),
    })),
  };
}

export function parseDatabaseMarkdownMarker(
  value: string | undefined,
): {
  title?: string;
  dataSource?: string;
  columns: TableColumnSchema[];
  rows: Array<{ id: string; values: Record<string, string> }>;
  views?: DatabaseViewState[];
  primaryViewId?: string | null;
} | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^<!--\s*pen-database:([\s\S]+?)\s*-->$/);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]!)) as {
      title?: string;
      dataSource?: string;
      columns?: TableColumnSchema[];
      rows?: Array<{ id?: string; values?: Record<string, unknown> }>;
      views?: DatabaseViewState[];
      primaryViewId?: string | null;
    };
    if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) {
      return null;
    }
    return {
      title: parsed.title,
      dataSource: parsed.dataSource,
      columns: parsed.columns,
      rows: parsed.rows.map((row, index) => ({
        id:
          typeof row?.id === "string" && row.id.length > 0
            ? row.id
            : `row-${index}`,
        values: Object.fromEntries(
          Object.entries(row?.values ?? {}).map(([key, entryValue]) => [
            key,
            entryValue == null ? "" : String(entryValue),
          ]),
        ),
      })),
      views: Array.isArray(parsed.views) ? parsed.views : undefined,
      primaryViewId:
        typeof parsed.primaryViewId === "string" || parsed.primaryViewId === null
          ? parsed.primaryViewId
          : undefined,
    };
  } catch {
    return null;
  }
}
