import type { DocumentOp } from "@input/pen-types";
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
						type: "splice-text",
						blockId,
						cell: { row: cellCoord.row, col: cellCoord.col },
						from: range.start,
						to: range.end,
						insert: "",
					}
				: {
						type: "splice-text",
						blockId,
						from: range.start,
						to: range.end,
						insert: "",
					},
		);
	}

	if (text.length > 0) {
		ops.push(
			cellCoord
				? {
						type: "splice-text",
						blockId,
						cell: { row: cellCoord.row, col: cellCoord.col },
						from: range.start,
						to: range.start,
						insert: text,
					}
				: {
						type: "splice-text",
						blockId,
						from: range.start,
						to: range.start,
						insert: text,
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
							type: "splice-text",
							blockId,
							cell: { row: cellCoord.row, col: cellCoord.col },
							from: op.offset,
							to: op.offset + op.length,
							insert: "",
						}
					: {
							type: "splice-text",
							blockId,
							from: op.offset,
							to: op.offset + op.length,
							insert: "",
						},
			);
			continue;
		}

		ops.push(
			cellCoord
				? {
						type: "splice-text",
						blockId,
						cell: { row: cellCoord.row, col: cellCoord.col },
						from: op.offset,
						to: op.offset,
						insert: op.text,
					}
				: {
						type: "splice-text",
						blockId,
						from: op.offset,
						to: op.offset,
						insert: op.text,
						marks: resolveInsertMarks(ytext, op.offset),
					},
		);
	}

	return ops;
}
