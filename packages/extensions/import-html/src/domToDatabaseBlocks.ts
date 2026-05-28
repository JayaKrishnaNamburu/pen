import type { DOMNode } from "./domAdapter";
import { parseInlineContent } from "./inlineParser";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { PendingBlock } from "@pen/core";
import { normalizeStoredSelectValue } from "@pen/types";

export function parseTypedDatabaseTable(node: DOMNode): PendingBlock | null {
  const headerCells = collectDatabaseHeaderCells(node);
  if (headerCells.length === 0) {
    return null;
  }

  const columns = headerCells.map((cell, index) => {
    const columnId = cell.attributes?.["data-col-id"]?.trim() || `col-${index}`;
    const columnType = cell.attributes?.["data-col-type"]?.trim() || "text";
    const inline = parseInlineContent(cell);
    const options = parseEncodedJSON(cell.attributes?.["data-col-options"]);
    const format = parseEncodedJSON(cell.attributes?.["data-col-format"]);
    const width = cell.attributes?.["data-col-width"];
    const pinned = cell.attributes?.["data-col-pinned"];
    const column: TableColumnSchema = {
      id: columnId,
      title: inline.text || `Column ${index + 1}`,
      type: columnType as TableColumnSchema["type"],
    };

    if (Array.isArray(options)) {
      column.options = options as TableColumnSchema["options"];
    }
    if (format && typeof format === "object") {
      column.format = format as TableColumnSchema["format"];
    }
    if (width != null && width !== "" && Number.isFinite(Number(width))) {
      column.width = Number(width);
    }
    if (pinned === "left" || pinned === "right") {
      column.pinned = pinned;
    }
    if (cell.attributes?.["data-col-hidden"] !== undefined) {
      column.hidden = cell.attributes["data-col-hidden"] === "true";
    }
    if (cell.attributes?.["data-col-readonly"] !== undefined) {
      column.readonly = cell.attributes["data-col-readonly"] === "true";
    }

    return column;
  });

  const bodyRows = collectDatabaseBodyRows(node);
  const rows = bodyRows.map((row, rowIndex) => {
    const cellNodes = (row.children ?? []).filter((child) => child.tagName === "td" || child.tagName === "th");
    const values = Object.fromEntries(
      columns.map((column, columnIndex) => {
        const raw = parseInlineContent(cellNodes[columnIndex] ?? { type: "element", tagName: "span", children: [] }).text;
        return [column.id, coerceImportedCellValue(raw, column)];
      }),
    );

    return {
      id: `row-${rowIndex}`,
      values,
    };
  });

  return {
    type: "database",
    props: {
      title: "Untitled",
      dataSource: "local",
    },
    database: {
      columns,
      rows,
      views: undefined,
      primaryViewId: null,
    },
  };
}

function coerceImportedCellValue(raw: string, column: TableColumnSchema): string {
  if (!raw || !column.options?.length) {
    return raw;
  }
  if (column.type === "select") {
    return normalizeStoredSelectValue(raw, column.options);
  }
  if (column.type === "multiSelect") {
    let parsed: string[];
    try {
      const json = JSON.parse(raw);
      parsed = Array.isArray(json) ? json.map(String) : [raw];
    } catch {
      parsed = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    const normalized = parsed.map((v) => normalizeStoredSelectValue(v, column.options));
    return normalized.length > 0 ? JSON.stringify(normalized) : raw;
  }
  return raw;
}

export function parseDatabasePayload(
  rawValue: string | undefined,
): {
  title?: string;
  dataSource?: string;
  columns: TableColumnSchema[];
  rows: Array<{ id: string; values: Record<string, string> }>;
  views?: DatabaseViewState[];
  primaryViewId?: string | null;
} | null {
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as {
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
          Object.entries(row?.values ?? {}).map(([key, value]) => [
            key,
            value == null ? "" : String(value),
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

export function collectTableRows(tableNode: DOMNode): DOMNode[] {
  const rows: DOMNode[] = [];
  for (const child of tableNode.children ?? []) {
    if (child.tagName === "tr") {
      rows.push(child);
    } else if (
      child.tagName === "thead" ||
      child.tagName === "tbody" ||
      child.tagName === "tfoot"
    ) {
      for (const row of child.children ?? []) {
        if (row.tagName === "tr") rows.push(row);
      }
    }
  }
  return rows;
}

function collectDatabaseHeaderCells(tableNode: DOMNode): DOMNode[] {
  const headerRow =
    tableNode.children?.find((child) => child.tagName === "thead")?.children?.find(
      (child) => child.tagName === "tr",
    ) ??
    collectTableRows(tableNode).find((row) =>
      (row.children ?? []).some((child) => child.tagName === "th" && child.attributes?.["data-col-type"] != null),
    ) ??
    null;

  if (!headerRow) {
    return [];
  }

  const headerCells = (headerRow.children ?? []).filter((child) => child.tagName === "th");
  const isTyped = headerCells.some(
    (cell) =>
      cell.attributes?.["data-col-type"] != null ||
      cell.attributes?.["data-col-id"] != null,
  );
  return isTyped ? headerCells : [];
}

function collectDatabaseBodyRows(tableNode: DOMNode): DOMNode[] {
  const tbody = tableNode.children?.find((child) => child.tagName === "tbody");
  if (tbody) {
    return (tbody.children ?? []).filter((child) => child.tagName === "tr");
  }

  const allRows = collectTableRows(tableNode);
  return allRows.slice(1);
}

function parseEncodedJSON(rawValue: string | undefined): unknown {
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(decodeURIComponent(rawValue));
  } catch {
    return undefined;
  }
}

function extractText(node: DOMNode): string {
  if (node.type === "text") return node.textContent ?? "";
  return (node.children ?? []).map(extractText).join("");
}
