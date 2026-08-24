import type { Editor } from "@input/pen-types";
import type { SelectionPoint } from "../field-editor/selectionBridge";
import { getEditorBlockSelectionRole } from "./blockSelectionSemantics";

type DomSelectionPoints = {
	anchor: SelectionPoint;
	focus: SelectionPoint;
};

type NormalizedSelectionIntent =
	| {
			type: "text";
			anchor: SelectionPoint;
			focus: SelectionPoint;
	  }
	| {
			type: "block";
			blockIds: string[];
	  };

function isStructuralRole(
	editor: Editor,
	blockId: string,
): boolean {
	const role = getEditorBlockSelectionRole(editor, blockId);
	return role != null && role !== "editable-inline";
}

function coverMixedBoundaryStructuralEnds(
	editor: Editor,
	selection: DomSelectionPoints,
): DomSelectionPoints {
	if (selection.anchor.blockId === selection.focus.blockId) {
		return selection;
	}
	const anchorStructural = isStructuralRole(editor, selection.anchor.blockId);
	const focusStructural = isStructuralRole(editor, selection.focus.blockId);
	if (anchorStructural === focusStructural) {
		return selection;
	}
	const order = editor.documentState.blockOrder;
	const anchorIdx = order.indexOf(selection.anchor.blockId);
	const focusIdx = order.indexOf(selection.focus.blockId);
	if (anchorIdx < 0 || focusIdx < 0) {
		return selection;
	}
	const selectingForward = anchorIdx <= focusIdx;
	return {
		anchor: anchorStructural
			? {
					blockId: selection.anchor.blockId,
					offset: selectingForward ? 0 : 1,
				}
			: selection.anchor,
		focus: focusStructural
			? {
					blockId: selection.focus.blockId,
					offset: selectingForward ? 1 : 0,
				}
			: selection.focus,
	};
}

export function normalizeSelectionFormation(
	editor: Editor,
	selection: DomSelectionPoints,
): NormalizedSelectionIntent {
	// T2 / N2 / §4.2: reads are never escalated by block type. A mixed
	// text/structural range stays a text selection. The structural end
	// is expanded to a full 0..1 cover so delete keeps the paragraph
	// prefix and removes the divider. The write escalation (a full 0..1
	// cover of a single non-text block) lives in `_validateText`.
	const covered = coverMixedBoundaryStructuralEnds(editor, selection);
	return {
		type: "text",
		anchor: covered.anchor,
		focus: covered.focus,
	};
}
