import React, { useRef } from "react";
import { resolveEditorMessage } from "@input/pen-core";
import type { BlockHandle, BlockRenderContext, CellSelection } from "@input/pen-types";
import { useEditorContext } from "../context/editorContext";
import { useFieldEditorContext } from "../context/fieldEditorContext";
import { useFieldEditorState } from "../hooks/useFieldEditorState";
import { useSelection } from "../hooks/useSelection";
import { DATA_ATTRS } from "../utils/dataAttributes";
import { isCellInSelection } from "../utils/cellSelection";
import { TableCellContent } from "../primitives/editor/tableCellContent";

const TABLE_CONTROL_MIN_SIZE_PX = 24;

function TableRendererInner(props: {
	block: BlockHandle;
	ctx: BlockRenderContext;
}) {
	const { block, ctx } = props;
	const { editor, readonly } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const editorSelection = useSelection(editor);

	const table = block.as("table");
	const rowCount = table?.tableRowCount() ?? 0;
	const colCount = table?.tableColumnCount() ?? 0;
	const hasHeaderRow = !!block.props.hasHeaderRow;
	const addRowRef = useRef<HTMLButtonElement>(null);
	const addColumnRef = useRef<HTMLButtonElement>(null);

	const cellSelection =
		editorSelection?.type === "cell" && editorSelection.blockId === block.id
			? editorSelection
			: null;

	const isEditingThisCell = (row: number, col: number) =>
		fieldEditorState.activeCellCoord?.blockId === block.id &&
		fieldEditorState.activeCellCoord.row === row &&
		fieldEditorState.activeCellCoord.col === col;

	function handleCellMouseDown(
		event: React.MouseEvent<HTMLTableCellElement>,
		row: number,
		col: number,
	) {
		if (readonly || !fieldEditor) return;
		if (isEditingThisCell(row, col)) return;

		event.preventDefault();
		event.stopPropagation();

		if (event.shiftKey && cellSelection) {
			editor.selectCellRange(block.id, cellSelection.anchor, { row, col });
			return;
		}

		editor.selectCell(block.id, row, col);
	}

	function handleCellDoubleClick(
		event: React.MouseEvent<HTMLTableCellElement>,
		row: number,
		col: number,
	) {
		if (readonly || !fieldEditor) return;

		event.preventDefault();
		event.stopPropagation();

		const cellSurface = event.currentTarget.querySelector(
			`[${DATA_ATTRS.fieldEditorSurface}]`,
		) as HTMLElement | null;
		if (cellSurface) {
			fieldEditor.activateCellFromElement?.(block.id, row, col, cellSurface)
				?? fieldEditor.activateCell?.(block.id, row, col);
		} else {
			fieldEditor.activateCell?.(block.id, row, col);
		}
	}

	function handleAddRow() {
		editor.apply(
			[{ type: "grid", blockId: block.id, change: { kind: "insert-row", index: rowCount  }}],
			{ origin: "user" },
		);
		queueMicrotask(() => addRowRef.current?.focus());
	}

	function handleAddColumn() {
		editor.apply(
			[{ type: "grid", blockId: block.id, change: { kind: "insert-column", index: colCount  }}],
			{ origin: "user" },
		);
		queueMicrotask(() => addColumnRef.current?.focus());
	}

	function handleControlMouseDown(event: React.MouseEvent<HTMLButtonElement>) {
		event.preventDefault();
		event.stopPropagation();
	}

	const cellAttrs = (row: number, col: number) => ({
		[DATA_ATTRS.tableCell]: "",
		[DATA_ATTRS.tableCellRow]: row,
		[DATA_ATTRS.tableCellCol]: col,
		"data-pen-cell-selected": cellSelection && isCellInSelection(cellSelection, row, col) ? "" : undefined,
	});

	const headerCells = hasHeaderRow
		? Array.from({ length: colCount }, (_, colIdx) => (
			<th
				key={`hdr-${colIdx}`}
				scope="col"
				{...cellAttrs(0, colIdx)}
				onMouseDown={(e) => handleCellMouseDown(e, 0, colIdx)}
				onDoubleClick={(e) => handleCellDoubleClick(e, 0, colIdx)}
			>
				<TableCellContent
					tableBlockId={block.id}
					row={0}
					col={colIdx}
					placeholder={resolveEditorMessage(
						editor,
						"pen.table.columnPlaceholder",
						{ index: colIdx + 1 },
					)}
				/>
			</th>
		))
		: null;

	const dataStartRow = hasHeaderRow ? 1 : 0;

	const bodyRows: React.ReactElement[] = [];
	for (let rowIdx = dataStartRow; rowIdx < rowCount; rowIdx++) {
		const cells: React.ReactElement[] = [];
		for (let colIdx = 0; colIdx < colCount; colIdx++) {
			cells.push(
				<td
					key={`cell-${rowIdx}-${colIdx}`}
					{...cellAttrs(rowIdx, colIdx)}
					onMouseDown={(e) => handleCellMouseDown(e, rowIdx, colIdx)}
					onDoubleClick={(e) => handleCellDoubleClick(e, rowIdx, colIdx)}
				>
					<TableCellContent
						tableBlockId={block.id}
						row={rowIdx}
						col={colIdx}
					/>
				</td>,
			);
		}
		bodyRows.push(
			<tr key={`row-${rowIdx}`} data-pen-table-row="" data-row={rowIdx}>
				{cells}
			</tr>,
		);
	}

	const addColumnControl = readonly ? null : (
		<button
			ref={addColumnRef}
			type="button"
			className="pen-table-add-column-control"
			style={{
				minWidth: TABLE_CONTROL_MIN_SIZE_PX,
				minHeight: TABLE_CONTROL_MIN_SIZE_PX,
			}}
			aria-label={resolveEditorMessage(editor, "pen.table.addColumn")}
			{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
			onMouseDown={handleControlMouseDown}
			onClick={handleAddColumn}
		>
			<span>+</span>
		</button>
	);

	const addRowControl = readonly ? null : (
		<button
			ref={addRowRef}
			type="button"
			className="pen-table-add-row-control"
			style={{
				minWidth: TABLE_CONTROL_MIN_SIZE_PX,
				minHeight: TABLE_CONTROL_MIN_SIZE_PX,
			}}
			aria-label={resolveEditorMessage(editor, "pen.table.addRow")}
			{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
			onMouseDown={handleControlMouseDown}
			onClick={handleAddRow}
		>
			<span>+</span>
		</button>
	);

	return (
		<div
			ref={ctx.ref as React.Ref<HTMLDivElement>}
			data-block-type="table"
			data-selected={ctx.selected ? "" : undefined}
		>
			<div className="pen-table-shell">
				<div className="pen-table-main">
					<div
						{...{ [DATA_ATTRS.tableFrame]: "" }}
						data-selected={ctx.selected ? "" : undefined}
					>
						<table {...{ [DATA_ATTRS.table]: "" }}>
							{hasHeaderRow && headerCells && (
								<thead>
									<tr data-pen-table-row="" data-row="header">
										{headerCells}
									</tr>
								</thead>
							)}
							<tbody>{bodyRows}</tbody>
						</table>
					</div>
					{addRowControl}
				</div>
				{addColumnControl}
			</div>
		</div>
	);
}

export function TableRenderer(
	block: BlockHandle,
	ctx: BlockRenderContext,
): React.ReactElement {
	return <TableRendererInner block={block} ctx={ctx} />;
}
