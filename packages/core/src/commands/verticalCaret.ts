import type { Editor } from "@input/pen-types";

/**
 * Geometry seam for `pen.caretUp` / `pen.caretDown` (G5).
 *
 * Core cannot import `@input/pen-dom`. The field-editor host registers
 * `measureNow(() => verticalCaretTarget(...))` here after `createEditor()`.
 * Headless tests inject a fake. Until a measure is registered, the handlers
 * fall back to logical block-edge crossing (`moveCaretAcrossBlocks`).
 *
 * `goalX` is stored on the editor (v1 `SelectionState` has no field for it;
 * Wave 5 adds it). No rAF / timeout / retry — S4.
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

const measures = new WeakMap<Editor, VerticalCaretMeasure>();
const goalXs = new WeakMap<Editor, number>();

export function setVerticalCaretMeasure(
	editor: Editor,
	measure: VerticalCaretMeasure | null,
): void {
	if (measure) {
		measures.set(editor, measure);
		return;
	}
	measures.delete(editor);
}

export function getVerticalCaretMeasure(
	editor: Editor,
): VerticalCaretMeasure | undefined {
	return measures.get(editor);
}

export function getVerticalCaretGoalX(editor: Editor): number | null {
	return goalXs.get(editor) ?? null;
}

export function setVerticalCaretGoalX(
	editor: Editor,
	goalX: number | null,
): void {
	if (goalX == null) {
		goalXs.delete(editor);
		return;
	}
	goalXs.set(editor, goalX);
}
