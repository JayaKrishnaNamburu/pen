import type { Block, BlockHandle } from "@input/pen-types";

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
