import type { CommandResult, Editor } from "@input/pen-types";

import {
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
} from "../editor/textSegmentation";
import {
	arrowFromBlockSelection,
	type ArrowDirection,
	transitionCellSelection,
} from "../selection/transitions";
import {
	buildTransitionSnapshot,
	fromTransitionSelection,
	getEditorLocale,
	toTransitionSelection,
} from "./helpers";
import type { CaretMotionParam } from "./caretParams";

const CELL_CARET_SEAM = Symbol.for("pen.cellCaretSeam");

export type CellCaretFocus = {
	readonly blockId: string;
	readonly row: number;
	readonly col: number;
	readonly start: number;
	readonly end: number;
};

export type CellCaretWrite = (next: {
	readonly start: number;
	readonly end: number;
}) => void;

type CellCaretSeam = {
	focus: CellCaretFocus | null;
	write: CellCaretWrite | null;
};

type CellMotionKind =
	| ArrowDirection
	| "word-left"
	| "word-right"
	| "line-start"
	| "line-end";

export function setCellCaretFocus(
	editor: Editor,
	focus: CellCaretFocus | null,
	write: CellCaretWrite | null = null,
): void {
	(editor as unknown as Record<symbol, CellCaretSeam>)[CELL_CARET_SEAM] = {
		focus,
		write,
	};
}

export function getCellCaretFocus(editor: Editor): CellCaretFocus | null {
	return (
		(editor as unknown as Record<symbol, CellCaretSeam | undefined>)[
			CELL_CARET_SEAM
		]?.focus ?? null
	);
}

export function handleCellEditingCaret(
	editor: Editor,
	param: CaretMotionParam,
	direction: CellMotionKind,
): CommandResult | false | undefined {
	const host = editor as unknown as Record<symbol, CellCaretSeam | undefined>;
	const seam = host[CELL_CARET_SEAM];
	const focus = seam?.focus;
	if (!seam || !focus) {
		return undefined;
	}

	const cell = editor
		.getBlock(focus.blockId)
		?.as("table")
		?.tableCell(focus.row, focus.col);
	const text = cell?.textContent() ?? "";
	const length = cell?.length() ?? text.length;
	const locale = getEditorLocale(editor);
	const start = clampCellOffset(length, focus.start);
	const end = clampCellOffset(length, focus.end);

	const next = stepCellTextOffset(
		text,
		start,
		end,
		direction,
		param.extend,
		locale,
	);
	seam.write?.({ start: next.start, end: next.end });
	seam.focus = {
		blockId: focus.blockId,
		row: focus.row,
		col: focus.col,
		start: next.start,
		end: next.end,
	};
	return true;
}

export function handleCellSelectionArrow(
	editor: Editor,
	param: CaretMotionParam,
	direction: ArrowDirection,
): CommandResult | false | undefined {
	if (editor.selection?.type !== "cell") {
		return undefined;
	}
	const snapshot = buildCellTransitionSnapshot(editor);
	const next = transitionCellSelection(
		snapshot,
		toTransitionSelection(editor),
		{
			source: "keyboard",
			direction,
			extend: param.extend,
		},
	);
	const selection = fromTransitionSelection(next, snapshot.blockOrder);
	if (!selection) {
		return false;
	}
	return { selection };
}

function buildCellTransitionSnapshot(editor: Editor) {
	const snapshot = buildTransitionSnapshot(editor);
	const blocks = { ...snapshot.blocks };
	for (const id of snapshot.blockOrder) {
		const existing = blocks[id];
		if (!existing) {
			continue;
		}
		const table = editor.getBlock(id)?.as("table");
		if (!table) {
			continue;
		}
		blocks[id] = {
			...existing,
			grid: {
				rows: table.tableRowCount(),
				cols: table.tableColumnCount(),
			},
		};
	}
	return { ...snapshot, blocks };
}

function stepCellTextOffset(
	text: string,
	start: number,
	end: number,
	direction: CellMotionKind,
	extend: boolean,
	locale: string,
): { start: number; end: number } {
	const movingStart = isBackwardCellMotion(direction);
	const from = movingStart ? start : end;
	const to = nextCellTextOffset(text, from, direction, locale);
	if (!extend || start === end) {
		return { start: to, end: to };
	}
	if (movingStart) {
		return { start: Math.min(to, end), end };
	}
	return { start, end: Math.max(to, start) };
}

function nextCellTextOffset(
	text: string,
	offset: number,
	direction: CellMotionKind,
	locale: string,
): number {
	switch (direction) {
		case "left":
			return previousGraphemeBoundary(text, offset, locale);
		case "right":
			return nextGraphemeBoundary(text, offset, locale);
		case "up":
		case "line-start":
			return 0;
		case "down":
		case "line-end":
			return text.length;
		case "word-left":
			return previousWordBoundary(text, offset, locale);
		case "word-right":
			return nextWordBoundary(text, offset, locale);
		default: {
			const _exhaustive: never = direction;
			return _exhaustive;
		}
	}
}

function isBackwardCellMotion(direction: CellMotionKind): boolean {
	switch (direction) {
		case "left":
		case "up":
		case "word-left":
		case "line-start":
			return true;
		case "right":
		case "down":
		case "word-right":
		case "line-end":
			return false;
		default: {
			const _exhaustive: never = direction;
			return _exhaustive;
		}
	}
}

function clampCellOffset(length: number, offset: number): number {
	if (offset <= 0) {
		return 0;
	}
	if (offset >= length) {
		return length;
	}
	return offset;
}
