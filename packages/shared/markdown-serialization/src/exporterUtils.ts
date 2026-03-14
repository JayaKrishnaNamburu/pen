import type { Block, BlockHandle, DatabaseViewState, TableColumnSchema } from "@pen/types";

export function buildTableChildren(handle: BlockHandle): Block[] | undefined {
  const rowCount = handle.tableRowCount();
  if (rowCount === 0) return undefined;
  const colCount = handle.tableColumnCount();

  const rows: Block[] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const cells: Block[] = [];
    for (let columnIndex = 0; columnIndex < colCount; columnIndex++) {
      const cell = handle.tableCell(rowIndex, columnIndex);
      cells.push({
        id: cell?.id ?? `${rowIndex}-${columnIndex}`,
        type: "__table_cell",
        props: {},
        content: cell?.textContent() ?? "",
      });
    }
    rows.push({
      id: `row-${rowIndex}`,
      type: "__table_row",
      props: {},
      children: cells,
    });
  }
  return rows;
}

export interface ExportedDatabaseData {
  title?: string;
  dataSource?: "local" | "remote" | "hybrid";
  columns: TableColumnSchema[];
  rows: Array<{ id: string; values: Record<string, string> }>;
  views?: DatabaseViewState[];
  primaryViewId?: string | null;
}

export function buildDatabaseData(handle: BlockHandle): ExportedDatabaseData | undefined {
  if (handle.type !== "database") return undefined;

  const columns = [...handle.tableColumns()];
  if (columns.length === 0) return undefined;

  const rows: Array<{ id: string; values: Record<string, string> }> = [];
  const rowCount = handle.tableRowCount();
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const rowHandle = handle.tableRow(rowIndex);
    const values: Record<string, string> = {};
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const cell = handle.tableCell(rowIndex, columnIndex);
      values[columns[columnIndex]!.id] = cell?.textContent() ?? "";
    }
    const rowId = rowHandle?.id ?? `row-${rowIndex}`;
    rows.push({ id: rowId, values });
  }

  return {
    title: typeof handle.props.title === "string" ? (handle.props.title as string) : undefined,
    dataSource:
      handle.props.dataSource === "remote" || handle.props.dataSource === "hybrid"
        ? (handle.props.dataSource as "remote" | "hybrid")
        : "local",
    columns,
    rows,
    views: [...handle.databaseViews()],
    primaryViewId: handle.databasePrimaryViewId(),
  };
}
