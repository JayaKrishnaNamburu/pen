import type { Editor } from "@input/pen-types";

/**
 * Geometry seam for `pen.caretUp` / `pen.caretDown` (G5).
 *
 * Core cannot import `@input/pen-dom`. The field-editor host registers
 * `measureNow(() => verticalCaretTarget(...))` here after `createEditor()`.
 * Headless tests inject a fake. Until a measure is registered, the handlers
 * fall back to logical block-edge crossing (`moveCaretAcrossBlocks`).
 *
 * Stored on a symbol of the editor instance so registry dispatch proxies
 * (which forward `get` to the source) still see the same seam. `goalX` is
 * here because v1 `SelectionState` has no field for it; Wave 5 adds it.
 * No rAF / timeout / retry — S4.
 */

export type VerticalCaretDirection = "up" | "down";

export type VerticalCaretPoint = {
	readonly blockId: string;
	readonly offset: number;
};

export type VerticalCaretMeasureResult = {
	readonly point: VerticalCaretPoint;
	readonly goalX: number;
};

export type VerticalCaretMeasure = (
	editor: Editor,
	current: VerticalCaretPoint,
	direction: VerticalCaretDirection,
	goalX: number | null,
) => VerticalCaretMeasureResult | null;

const SEAM = Symbol.for("pen.verticalCaretSeam");

type VerticalCaretSeam = {
	measure: VerticalCaretMeasure | null;
	goalX: number | null;
};

function readSeam(editor: Editor): VerticalCaretSeam | undefined {
	return (editor as unknown as Record<symbol, VerticalCaretSeam | undefined>)[
		SEAM
	];
}

function writeSeam(editor: Editor, seam: VerticalCaretSeam): void {
	(editor as unknown as Record<symbol, VerticalCaretSeam>)[SEAM] = seam;
}

function getOrCreateSeam(editor: Editor): VerticalCaretSeam {
	const existing = readSeam(editor);
	if (existing) {
		return existing;
	}
	const created: VerticalCaretSeam = { measure: null, goalX: null };
	writeSeam(editor, created);
	return created;
}

export function setVerticalCaretMeasure(
	editor: Editor,
	measure: VerticalCaretMeasure | null,
): void {
	getOrCreateSeam(editor).measure = measure;
}

export function getVerticalCaretMeasure(
	editor: Editor,
): VerticalCaretMeasure | undefined {
	return readSeam(editor)?.measure ?? undefined;
}

export function getVerticalCaretGoalX(editor: Editor): number | null {
	return readSeam(editor)?.goalX ?? null;
}

export function setVerticalCaretGoalX(
	editor: Editor,
	goalX: number | null,
): void {
	const existing = readSeam(editor);
	if (existing) {
		existing.goalX = goalX;
		return;
	}
	writeSeam(editor, { measure: null, goalX });
}
