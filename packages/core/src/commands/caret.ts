import type {
	CommandResult,
	Editor,
	FacetProvider,
	SelectionState,
} from "@input/pen-types";

import {
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
} from "../editor/textSegmentation";
import {
	nextNormalPosition,
	type NextNormalPositionResult,
} from "../selection/normalPosition";
import {
	arrowFromBlockSelection,
	escalateSelectAll,
	transitionCellSelection,
	type ArrowDirection,
	type TransitionSnapshot,
} from "../selection/transitions";
import { commandHandler, defineCommand } from "./define";
import { isCollapsed } from "../selection/helpers";
import {
	blockSelectionResult,
	buildNormalPositionSnapshot,
	buildTransitionSnapshot,
	collapsedAt,
	emitCommandDiagnostic,
	fromTransitionSelection,
	getAdjacentVisibleBlockId,
	getAtomRangeAtOffset,
	getEditorLocale,
	isEditableTextBlock,
	logicalInline,
	readTextAnchor,
	readTextFocus,
	textSelectionResult,
	toTransitionSelection,
	type Point,
} from "./helpers";
import {
	getVerticalCaretGoalX,
	getVerticalCaretMeasure,
	setVerticalCaretGoalX,
	type VerticalCaretDirection,
} from "./verticalCaret";

export interface CaretMotionParam {
	readonly extend: boolean;
}

export interface SelectBlockParam {
	readonly blockId: string;
}

export const caretLeft = defineCommand<CaretMotionParam>("pen.caretLeft");
export const caretRight = defineCommand<CaretMotionParam>("pen.caretRight");
export const caretUp = defineCommand<CaretMotionParam>("pen.caretUp");
export const caretDown = defineCommand<CaretMotionParam>("pen.caretDown");
export const caretLineStart = defineCommand<CaretMotionParam>(
	"pen.caretLineStart",
);
export const caretLineEnd = defineCommand<CaretMotionParam>("pen.caretLineEnd");
export const caretBlockStart = defineCommand<CaretMotionParam>(
	"pen.caretBlockStart",
);
export const caretBlockEnd = defineCommand<CaretMotionParam>("pen.caretBlockEnd");
export const caretDocStart = defineCommand<CaretMotionParam>("pen.caretDocStart");
export const caretDocEnd = defineCommand<CaretMotionParam>("pen.caretDocEnd");
export const caretWordLeft = defineCommand<CaretMotionParam>("pen.caretWordLeft");
export const caretWordRight = defineCommand<CaretMotionParam>(
	"pen.caretWordRight",
);
export const selectAll = defineCommand("pen.selectAll");
export const selectBlock = defineCommand<SelectBlockParam>("pen.selectBlock");

export function caretCommandHandlers(): FacetProvider[] {
	return [
		commandHandler(caretLeft, (editor, param) =>
			handleGraphemeCaret(editor, param, -1),
		),
		commandHandler(caretRight, (editor, param) =>
			handleGraphemeCaret(editor, param, 1),
		),
		commandHandler(caretUp, (editor, param) =>
			handleVerticalCaret(editor, param, "up"),
		),
		commandHandler(caretDown, (editor, param) =>
			handleVerticalCaret(editor, param, "down"),
		),
		commandHandler(caretLineStart, (editor, param) =>
			handleLineOrBlockEdge(editor, param, "start", true),
		),
		commandHandler(caretLineEnd, (editor, param) =>
			handleLineOrBlockEdge(editor, param, "end", true),
		),
		commandHandler(caretBlockStart, (editor, param) =>
			handleLineOrBlockEdge(editor, param, "start", false),
		),
		commandHandler(caretBlockEnd, (editor, param) =>
			handleLineOrBlockEdge(editor, param, "end", false),
		),
		commandHandler(caretDocStart, (editor, param) =>
			handleDocEdge(editor, param, "start"),
		),
		commandHandler(caretDocEnd, (editor, param) =>
			handleDocEdge(editor, param, "end"),
		),
		commandHandler(caretWordLeft, (editor, param) =>
			handleWordCaret(editor, param, -1),
		),
		commandHandler(caretWordRight, (editor, param) =>
			handleWordCaret(editor, param, 1),
		),
		commandHandler(selectAll, handleSelectAll),
		commandHandler(selectBlock, handleSelectBlock),
	];
}

function handleVerticalCaret(
	editor: Editor,
	param: CaretMotionParam,
	direction: VerticalCaretDirection,
): CommandResult | false {
	const fromCellEdit = handleCellEditingCaret(editor, param, direction);
	if (fromCellEdit !== undefined) {
		return finishNonVertical(editor, fromCellEdit);
	}

	const fromBlock = handleBlockSelectionArrow(editor, param, direction);
	if (fromBlock !== undefined) {
		return finishNonVertical(editor, fromBlock);
	}

	const fromCell = handleCellSelectionArrow(editor, param, direction);
	if (fromCell !== undefined) {
		return finishNonVertical(editor, fromCell);
	}

	const focus = readTextFocus(editor);
	if (!focus) {
		return false;
	}

	const measured = measureVerticalStep(editor, focus, direction);
	if (measured) {
		setVerticalCaretGoalX(editor, measured.goalX);
		return {
			selection: extendSelection(editor, param.extend, measured.point),
		};
	}

	const block = editor.getBlock(focus.blockId);
	if (!block) {
		return false;
	}
	const atEdge = isVerticalBlockEdge(block.length(), focus.offset, direction);
	if (!atEdge) {
		if (!getVerticalCaretMeasure(editor)) {
			emitCommandDiagnostic(editor, {
				code: "caret-geometry-unavailable",
				level: "info",
				source: "commands",
				message:
					"pen.caretUp / pen.caretDown has no geometry; mid-block vertical motion is a no-op",
				remediation:
					"Register setVerticalCaretMeasure after createEditor().",
			});
			return true;
		}
		return false;
	}

	// Logical fallback has no column. Drop goalX so the next geometry
	// step does not reuse a stale horizontal target (G5).
	setVerticalCaretGoalX(editor, null);
	const crossed = crossBlock(
		editor,
		focus.blockId,
		verticalCrossDirection(direction),
	);
	if (!crossed) {
		return { selection: extendSelection(editor, param.extend, focus) };
	}
	return { selection: extendSelection(editor, param.extend, crossed) };
}

function verticalCrossDirection(
	direction: VerticalCaretDirection,
): "previous" | "next" {
	switch (direction) {
		case "up":
			return "previous";
		case "down":
			return "next";
		default: {
			const _exhaustive: never = direction;
			return _exhaustive;
		}
	}
}

function isVerticalBlockEdge(
	length: number,
	offset: number,
	direction: VerticalCaretDirection,
): boolean {
	switch (direction) {
		case "up":
			return offset === 0;
		case "down":
			return offset === length;
		default: {
			const _exhaustive: never = direction;
			return _exhaustive;
		}
	}
}

function measureVerticalStep(
	editor: Editor,
	focus: Point,
	direction: VerticalCaretDirection,
): { point: Point; goalX: number } | null {
	const measure = getVerticalCaretMeasure(editor);
	if (!measure) {
		return null;
	}
	const result = measure(
		editor,
		focus,
		direction,
		getVerticalCaretGoalX(editor),
	);
	if (!result) {
		return null;
	}
	return result;
}

function handleGraphemeCaret(
	editor: Editor,
	param: CaretMotionParam,
	direction: -1 | 1,
): CommandResult | false {
	const arrow = direction === 1 ? "right" : "left";
	const fromCellEdit = handleCellEditingCaret(editor, param, arrow);
	if (fromCellEdit !== undefined) {
		return finishNonVertical(editor, fromCellEdit);
	}

	const fromBlock = handleBlockSelectionArrow(editor, param, arrow);
	if (fromBlock !== undefined) {
		return finishNonVertical(editor, fromBlock);
	}

	const fromCell = handleCellSelectionArrow(editor, param, arrow);
	if (fromCell !== undefined) {
		return finishNonVertical(editor, fromCell);
	}

	const focus = readTextFocus(editor);
	if (!focus) {
		return false;
	}

	const atomSelection = stepInlineAtom(editor, param, focus, direction);
	if (atomSelection !== undefined) {
		return finishNonVertical(editor, atomSelection);
	}

	const snapshot = buildNormalPositionSnapshot(editor);
	const stepped = nextNormalPosition(snapshot, focus, direction);
	const next = resolveStep(editor, focus, stepped, direction);
	if (!next) {
		return false;
	}
	return finishNonVertical(editor, {
		selection: extendSelection(editor, param.extend, next),
	});
}

function handleWordCaret(
	editor: Editor,
	param: CaretMotionParam,
	direction: -1 | 1,
): CommandResult | false {
	const fromCellEdit = handleCellEditingCaret(
		editor,
		param,
		direction === 1 ? "word-right" : "word-left",
	);
	if (fromCellEdit !== undefined) {
		return finishNonVertical(editor, fromCellEdit);
	}

	const fromBlock = handleBlockSelectionArrow(
		editor,
		param,
		direction === 1 ? "right" : "left",
	);
	if (fromBlock !== undefined) {
		return finishNonVertical(editor, fromBlock);
	}

	const fromCell = handleCellSelectionArrow(
		editor,
		param,
		direction === 1 ? "right" : "left",
	);
	if (fromCell !== undefined) {
		return finishNonVertical(editor, fromCell);
	}

	const focus = readTextFocus(editor);
	if (!focus) {
		return false;
	}

	const block = editor.getBlock(focus.blockId);
	if (!block || !isEditableTextBlock(editor, focus.blockId)) {
		return false;
	}

	const { text } = logicalInline(block);
	const locale = getEditorLocale(editor);
	const nextOffset =
		direction === 1
			? nextWordBoundary(text, focus.offset, locale)
			: previousWordBoundary(text, focus.offset, locale);

	if (nextOffset !== focus.offset) {
		return finishNonVertical(editor, {
			selection: extendSelection(editor, param.extend, {
				blockId: focus.blockId,
				offset: nextOffset,
			}),
		});
	}

	const crossed = crossBlock(
		editor,
		focus.blockId,
		direction === 1 ? "next" : "previous",
	);
	if (!crossed) {
		return false;
	}
	return finishNonVertical(editor, {
		selection: extendSelection(editor, param.extend, crossed),
	});
}

const CELL_CARET_SEAM = Symbol.for("pen.cellCaretSeam");
const LINE_EDGE_SEAM = Symbol.for("pen.lineEdgeSeam");

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
	(
		editor as unknown as Record<symbol, CellCaretSeam>
	)[CELL_CARET_SEAM] = { focus, write };
}

export function getCellCaretFocus(editor: Editor): CellCaretFocus | null {
	return (
		(editor as unknown as Record<symbol, CellCaretSeam | undefined>)[
			CELL_CARET_SEAM
		]?.focus ?? null
	);
}

export type LineEdgePoint = {
	readonly blockId: string;
	readonly offset: number;
};

export type LineEdgeMeasure = (
	editor: Editor,
	current: LineEdgePoint,
	edge: "start" | "end",
) => LineEdgePoint | null;

export function setLineEdgeMeasure(
	editor: Editor,
	measure: LineEdgeMeasure | null,
): void {
	(
		editor as unknown as Record<symbol, LineEdgeMeasure | null>
	)[LINE_EDGE_SEAM] = measure;
}

export function getLineEdgeMeasure(
	editor: Editor,
): LineEdgeMeasure | undefined {
	return (
		(editor as unknown as Record<symbol, LineEdgeMeasure | undefined>)[
			LINE_EDGE_SEAM
		] ?? undefined
	);
}

function handleLineOrBlockEdge(
	editor: Editor,
	param: CaretMotionParam,
	edge: "start" | "end",
	visual: boolean,
): CommandResult | false {
	const fromCellEdit = handleCellEditingCaret(
		editor,
		param,
		edge === "end" ? "line-end" : "line-start",
	);
	if (fromCellEdit !== undefined) {
		return finishNonVertical(editor, fromCellEdit);
	}

	const fromBlock = handleBlockSelectionArrow(
		editor,
		param,
		edge === "end" ? "right" : "left",
	);
	if (fromBlock !== undefined) {
		return finishNonVertical(editor, fromBlock);
	}

	const focus = readTextFocus(editor);
	if (!focus) {
		return false;
	}
	const block = editor.getBlock(focus.blockId);
	if (!block) {
		return false;
	}
	const measured = visual
		? (getLineEdgeMeasure(editor)?.(editor, focus, edge) ?? null)
		: null;
	const next = measured ?? {
		blockId: focus.blockId,
		offset: edge === "start" ? 0 : block.length(),
	};
	return finishNonVertical(editor, {
		selection: extendSelection(editor, param.extend, next),
	});
}

function handleDocEdge(
	editor: Editor,
	param: CaretMotionParam,
	edge: "start" | "end",
): CommandResult | false {
	if (getCellCaretFocus(editor)) {
		return true;
	}

	const fromBlock = handleBlockSelectionArrow(
		editor,
		param,
		edge === "end" ? "down" : "up",
	);
	if (fromBlock !== undefined) {
		return finishNonVertical(editor, fromBlock);
	}

	const focus = readTextFocus(editor);
	if (!focus && editor.selection?.type !== "block") {
		return false;
	}

	const target = documentEdgePoint(editor, edge);
	if (!target) {
		return false;
	}
	if (target.type === "block") {
		return finishNonVertical(editor, { selection: target.selection });
	}
	return finishNonVertical(editor, {
		selection: extendSelection(editor, param.extend, target.point),
	});
}

function handleSelectAll(editor: Editor): CommandResult | false {
	const snapshot = buildTransitionSnapshot(editor);
	const next = escalateSelectAll(snapshot, toTransitionSelection(editor));
	const selection = fromTransitionSelection(next, snapshot.blockOrder);
	if (!selection) {
		return false;
	}
	return finishNonVertical(editor, { selection });
}

function handleSelectBlock(
	editor: Editor,
	param: SelectBlockParam,
): CommandResult | false {
	if (!editor.getBlock(param.blockId)) {
		return false;
	}
	return finishNonVertical(editor, {
		selection: blockSelectionResult([param.blockId]),
	});
}

/**
 * G5: goalX is a vertical-only column. Successful left/right/word/line/doc
 * motion must not reuse the last vertical x. Misses leave it alone.
 */
function finishNonVertical(
	editor: Editor,
	result: CommandResult | false,
): CommandResult | false {
	if (result !== false) {
		setVerticalCaretGoalX(editor, null);
	}
	return result;
}

function handleCellEditingCaret(
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

	const next = stepCellTextOffset(text, start, end, direction, param.extend, locale);
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

function handleCellSelectionArrow(
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

function buildCellTransitionSnapshot(editor: Editor): TransitionSnapshot {
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

function handleBlockSelectionArrow(
	editor: Editor,
	param: CaretMotionParam,
	direction: ArrowDirection,
): CommandResult | false | undefined {
	if (editor.selection?.type !== "block") {
		return undefined;
	}
	const snapshot = buildTransitionSnapshot(editor);
	const next = arrowFromBlockSelection(
		snapshot,
		toTransitionSelection(editor),
		direction,
		param.extend,
	);
	const selection = fromTransitionSelection(next, snapshot.blockOrder);
	if (!selection) {
		return false;
	}
	return { selection };
}

function stepInlineAtom(
	editor: Editor,
	param: CaretMotionParam,
	focus: Point,
	direction: -1 | 1,
): CommandResult | false | undefined {
	const selection = editor.selection;
	if (!selection || selection.type !== "text") {
		return undefined;
	}

	const block = editor.getBlock(focus.blockId);
	if (!block) {
		return undefined;
	}

	if (
		!isCollapsed(selection) &&
		selection.anchor.blockId === focus.blockId &&
		selection.focus.blockId === focus.blockId
	) {
		const start = Math.min(selection.anchor.offset, selection.focus.offset);
		const end = Math.max(selection.anchor.offset, selection.focus.offset);
		const selectedAtom = getAtomRangeAtOffset(block, start);
		if (selectedAtom && selectedAtom.start === start && selectedAtom.end === end) {
			const offset = direction === 1 ? end : start;
			return {
				selection: extendSelection(editor, param.extend, {
					blockId: focus.blockId,
					offset,
				}),
			};
		}
		return undefined;
	}

	const probeOffset = direction === 1 ? focus.offset : focus.offset - 1;
	if (probeOffset < 0) {
		return undefined;
	}
	const atom = getAtomRangeAtOffset(block, probeOffset);
	if (!atom) {
		return undefined;
	}
	if (direction === 1 && atom.start !== focus.offset) {
		return undefined;
	}
	if (direction === -1 && atom.end !== focus.offset) {
		return undefined;
	}
	return {
		selection: textSelectionResult(
			param.extend ? (readTextAnchor(editor) ?? { blockId: focus.blockId, offset: atom.start }) : {
				blockId: focus.blockId,
				offset: atom.start,
			},
			{ blockId: focus.blockId, offset: atom.end },
		),
	};
}

function resolveStep(
	editor: Editor,
	focus: Point,
	stepped: NextNormalPositionResult,
	direction: -1 | 1,
): Point | SelectionState | null {
	if (!stepped) {
		return null;
	}
	if ("blockId" in stepped) {
		return stepped;
	}
	return crossBlock(
		editor,
		focus.blockId,
		direction === 1 ? "next" : "previous",
	);
}

function crossBlock(
	editor: Editor,
	blockId: string,
	direction: "previous" | "next",
): Point | SelectionState | null {
	const adjacentId = getAdjacentVisibleBlockId(editor, blockId, direction);
	if (!adjacentId) {
		return null;
	}
	if (!isEditableTextBlock(editor, adjacentId)) {
		return blockSelectionResult([adjacentId]);
	}
	const adjacent = editor.getBlock(adjacentId);
	if (!adjacent) {
		return null;
	}
	return {
		blockId: adjacent.id,
		offset: direction === "previous" ? adjacent.length() : 0,
	};
}

function documentEdgePoint(
	editor: Editor,
	edge: "start" | "end",
):
	| { type: "text"; point: Point }
	| { type: "block"; selection: SelectionState }
	| null {
	const order = editor.documentState.blockOrder;
	if (order.length === 0) {
		return null;
	}
	const blockId = edge === "start" ? order[0] : order[order.length - 1];
	if (!blockId) {
		return null;
	}
	if (!isEditableTextBlock(editor, blockId)) {
		return { type: "block", selection: blockSelectionResult([blockId]) };
	}
	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}
	return {
		type: "text",
		point: {
			blockId,
			offset: edge === "start" ? 0 : block.length(),
		},
	};
}

function extendSelection(
	editor: Editor,
	extend: boolean,
	next: Point | SelectionState,
): SelectionState {
	if (!isPoint(next)) {
		return next;
	}
	if (!extend) {
		return collapsedAt(next.blockId, next.offset);
	}
	const anchor = readTextAnchor(editor);
	if (!anchor) {
		return collapsedAt(next.blockId, next.offset);
	}
	return textSelectionResult(anchor, next, {
		blockOrder: editor.documentState.blockOrder,
	});
}

function isPoint(value: Point | SelectionState): value is Point {
	return value !== null && "offset" in value && !("type" in value);
}
