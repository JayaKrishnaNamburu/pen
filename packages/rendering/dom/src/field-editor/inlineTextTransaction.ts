import type { DocumentOp } from "@pen/types";
import type { ActiveCellCoord } from "./controller";
import type { FieldEditorTextLike } from "./crdt";

export type InlineTextRange = {
	start: number;
	end: number;
};

export type InlineTextDiffOp =
	| { type: "insert"; offset: number; text: string }
	| { type: "delete"; offset: number; length: number };

export type InlineTextSelectionTarget = {
	blockId: string;
	anchorOffset: number;
	focusOffset: number;
	cell?: {
		row: number;
		col: number;
	};
};

export function buildInlineTextEditTransaction(options: {
	blockId: string;
	range: InlineTextRange;
	text: string;
	marks?: Record<string, unknown>;
	cellCoord?: ActiveCellCoord | null;
}): {
	ops: DocumentOp[];
	selection: InlineTextSelectionTarget;
} {
	const { blockId, range, text, marks, cellCoord } = options;
	const ops: DocumentOp[] = [];
	const nextOffset = range.start + text.length;

	if (range.end > range.start) {
		ops.push(
			cellCoord
				? {
						type: "delete-table-cell-text",
						blockId,
						row: cellCoord.row,
						col: cellCoord.col,
						offset: range.start,
						length: range.end - range.start,
					}
				: {
						type: "delete-text",
						blockId,
						offset: range.start,
						length: range.end - range.start,
					},
		);
	}

	if (text.length > 0) {
		ops.push(
			cellCoord
				? {
						type: "insert-table-cell-text",
						blockId,
						row: cellCoord.row,
						col: cellCoord.col,
						offset: range.start,
						text,
					}
				: {
						type: "insert-text",
						blockId,
						offset: range.start,
						text,
						marks,
					},
		);
	}

	return {
		ops,
		selection: {
			blockId,
			anchorOffset: nextOffset,
			focusOffset: nextOffset,
			cell: cellCoord
				? { row: cellCoord.row, col: cellCoord.col }
				: undefined,
		},
	};
}

export function buildInlineTextDiffOps(options: {
	blockId: string;
	diff: readonly InlineTextDiffOp[];
	ytext: FieldEditorTextLike;
	resolveInsertMarks: (
		ytext: FieldEditorTextLike,
		offset: number,
	) => Record<string, unknown | null> | undefined;
	cellCoord?: ActiveCellCoord | null;
}): DocumentOp[] {
	const { blockId, diff, ytext, resolveInsertMarks, cellCoord } = options;
	const ops: DocumentOp[] = [];

	for (const op of diff) {
		if (op.type === "delete") {
			ops.push(
				cellCoord
					? {
							type: "delete-table-cell-text",
							blockId,
							row: cellCoord.row,
							col: cellCoord.col,
							offset: op.offset,
							length: op.length,
						}
					: {
							type: "delete-text",
							blockId,
							offset: op.offset,
							length: op.length,
						},
			);
			continue;
		}

		ops.push(
			cellCoord
				? {
						type: "insert-table-cell-text",
						blockId,
						row: cellCoord.row,
						col: cellCoord.col,
						offset: op.offset,
						text: op.text,
					}
				: {
						type: "insert-text",
						blockId,
						offset: op.offset,
						text: op.text,
						marks: resolveInsertMarks(ytext, op.offset),
					},
		);
	}

	return ops;
}
