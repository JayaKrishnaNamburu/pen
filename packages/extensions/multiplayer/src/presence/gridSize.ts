import type { Editor } from "@input/pen-types";
import type { MultiplayerCellCoord } from "../types";

export interface GridSize {
	rows: number;
	cols: number;
}

/**
 * Live grid dimensions of a block, or `null` when the block is gone, holds no
 * grid, or has collapsed to nothing addressable.
 *
 * Read twice per cell selection: once at the COL2 ingest boundary, and again on
 * resolve, because a commit can shrink the grid under a held selection.
 */
export function readGridSize(editor: Editor, blockId: string): GridSize | null {
	const table = editor.getBlock(blockId)?.as("table");
	if (!table) {
		return null;
	}
	const rows = table.tableRowCount();
	const cols = table.tableColumnCount();
	if (rows <= 0 || cols <= 0) {
		return null;
	}
	return { rows, cols };
}

/** Clamp a held coordinate into the post-commit grid (AS3). */
export function clampCellCoord(
	coord: MultiplayerCellCoord,
	grid: GridSize,
): MultiplayerCellCoord {
	return {
		row: Math.min(Math.max(coord.row, 0), grid.rows - 1),
		col: Math.min(Math.max(coord.col, 0), grid.cols - 1),
	};
}
