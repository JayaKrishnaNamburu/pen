import type { PendingBlock, InlineMark, MdastTable } from "./types.js";
import { processInlineNodes } from "./inlineMarks.js";

export function parseTable(tableNode: MdastTable): PendingBlock {
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
