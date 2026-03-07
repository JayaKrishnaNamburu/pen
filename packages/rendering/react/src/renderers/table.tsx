import React from "react";
import type { BlockHandle, BlockRenderContext } from "@pen/core";
import { InlineContent } from "../primitives/editor/inlineContent.js";

export function TableRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  const hasHeaderRow = (block.props?.hasHeaderRow as boolean) ?? false;
  const hasHeaderColumn = (block.props?.hasHeaderColumn as boolean) ?? false;

  const rows = block.children;

  const rowElements = rows.map((row, rowIdx) => {
    const cells = row.children;

    const cellElements =
      cells.length > 0
        ? cells.map((cell, colIdx) => {
            const isHeader =
              (hasHeaderRow && rowIdx === 0) ||
              (hasHeaderColumn && colIdx === 0);
            const Tag = isHeader ? "th" : "td";

            return React.createElement(
              Tag,
              {
                key: cell.id,
                "data-pen-table-cell": "",
                "data-row": rowIdx,
                "data-col": colIdx,
              },
              <InlineContent blockId={cell.id} />,
            );
          })
        : [
            <td key={`${rowIdx}-0`} data-pen-table-cell="" data-row={rowIdx} data-col={0}>
              <InlineContent blockId={row.id} />
            </td>,
          ];

    const rowEl = (
      <tr key={row.id} data-pen-table-row="" data-row={rowIdx}>
        {cellElements}
      </tr>
    );

    if (hasHeaderRow && rowIdx === 0) {
      return <thead key={`section-${rowIdx}`}>{rowEl}</thead>;
    }
    return rowEl;
  });

  const headerRow = hasHeaderRow ? rowElements[0] : null;
  const bodyRows = hasHeaderRow ? rowElements.slice(1) : rowElements;

  return (
    <div
      ref={ctx.ref as React.Ref<HTMLDivElement>}
      data-block-type="table"
      data-selected={ctx.selected || undefined}
    >
      <table>
        {headerRow}
        {bodyRows.length > 0 ? <tbody>{bodyRows}</tbody> : null}
      </table>
    </div>
  );
}
