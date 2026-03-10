import type { Editor } from "@pen/core";
import type { ActiveCellCoord } from "./controller";

export function getBlockYText(editor: Editor, blockId: string): unknown {
	return editor.internals.getBlockText(blockId);
}

export function getCellYText(
	editor: Editor,
	blockId: string,
	row: number,
	col: number,
): unknown {
	return editor.internals.getCellText(blockId, row, col);
}

export function getResolvedYText(
	editor: Editor,
	blockId: string,
	activeCellCoord: ActiveCellCoord | null,
): unknown {
	if (activeCellCoord?.blockId === blockId) {
		return getCellYText(
			editor,
			activeCellCoord.blockId,
			activeCellCoord.row,
			activeCellCoord.col,
		);
	}
	return getBlockYText(editor, blockId);
}

export function resolveCellInlineElement(
	blockId: string,
	row: number,
	col: number,
	root: HTMLElement | null | undefined,
): HTMLElement | null {
	if (!root) return null;
	return root.querySelector(
		`[data-block-id="${blockId}"] [data-cell-row="${row}"][data-cell-col="${col}"] [data-pen-inline-content]`,
	) as HTMLElement | null;
}
