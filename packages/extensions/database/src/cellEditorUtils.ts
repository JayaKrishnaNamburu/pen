import { DATA_ATTRS } from "@pen/react";
import type { Editor } from "@pen/types";

export function setCellText(editor: Editor, blockId: string, row: number, col: number, text: string): void {
	const block = editor.getBlock(blockId);
	if (!block) return;
	const rowHandle = block.tableRow(row);
	const column = block.tableColumns()[col];
	const cell = block.tableCell(row, col);
	if (!cell || !rowHandle || !column) return;
	editor.apply([{
		type: "database-update-cell",
		blockId,
		rowId: rowHandle.id,
		columnId: column.id,
		value: text,
	}], { origin: "user" });
}

export function toggleCheckbox(editor: Editor, blockId: string, row: number, col: number, isChecked: boolean): void {
	setCellText(editor, blockId, row, col, isChecked ? "false" : "true");
}

export function isCellActive(
	fieldEditorState: { activeCellCoord: { blockId: string; row: number; col: number } | null },
	blockId: string,
	row: number,
	col: number,
): boolean {
	return (
		fieldEditorState.activeCellCoord?.blockId === blockId &&
		fieldEditorState.activeCellCoord.row === row &&
		fieldEditorState.activeCellCoord.col === col
	);
}

export function editableCellAttrs(
	isActive: boolean,
	row: number,
	col: number,
	showPlaceholder: boolean,
	placeholder?: string,
): Record<string, unknown> {
	return {
		[DATA_ATTRS.inlineContent]: "",
		[DATA_ATTRS.fieldEditorSurface]: "",
		[DATA_ATTRS.fieldEditorActiveSurface]: isActive ? "" : undefined,
		[DATA_ATTRS.ignorePointerGesture]: isActive ? "" : undefined,
		[DATA_ATTRS.tableCellRow]: row,
		[DATA_ATTRS.tableCellCol]: col,
		[DATA_ATTRS.placeholderVisible]: showPlaceholder ? "" : undefined,
		"data-placeholder": showPlaceholder ? placeholder : undefined,
		style: { minWidth: "4rem", minHeight: "1.5rem", display: "block", width: "100%" },
	};
}

export function widgetCellAttrs(row: number, col: number): Record<string, unknown> {
	return {
		[DATA_ATTRS.ignorePointerGesture]: "",
		[DATA_ATTRS.tableCellRow]: row,
		[DATA_ATTRS.tableCellCol]: col,
		style: { minWidth: "4rem", minHeight: "1.5rem", display: "block", width: "100%", cursor: "default" },
	};
}

const TAG_COLORS: Record<string, string> = {
	red: "rgba(255, 86, 86, 0.2)",
	orange: "rgba(255, 163, 68, 0.2)",
	yellow: "rgba(255, 220, 73, 0.2)",
	green: "rgba(77, 208, 89, 0.2)",
	blue: "rgba(45, 120, 255, 0.2)",
	purple: "rgba(155, 89, 255, 0.2)",
	pink: "rgba(255, 89, 166, 0.2)",
	gray: "rgba(155, 155, 155, 0.2)",
};

export function tagColor(color?: string): string | undefined {
	if (!color) {
		return undefined;
	}
	return TAG_COLORS[color] ?? color;
}
