import type { Editor, SelectionState } from "@input/pen-types";
import { pointToEditorSelectionPoint } from "../field-editor/selectionBridge";
import { getEditorBlockSelectionRole } from "./blockSelectionSemantics";

export interface PointerSelectionGesture {
	blockId: string;
	clientX: number;
	clientY: number;
	anchorPoint: { blockId: string; offset: number } | null;
	startSelection: SelectionState | null;
	promotedDuringDrag: boolean;
	/**
	 * `blockId` came from the nearest block edge (G4) rather than a block
	 * under the pointer (FE10). The gesture never entered a field, so it has
	 * no native range to inherit within one block, and a gesture that never
	 * reached a block leaves mouseup to the click-outside affordance.
	 */
	startedInHostChrome: boolean;
}

export type ResolvedPointerDragSelection =
	| {
			mode: "mapped-text" | "canonical";
			anchorPoint: { blockId: string; offset: number };
			focusPoint: { blockId: string; offset: number };
	  }
	| {
			mode: "block";
			blockIds: string[];
	  };

export function createPointerSelectionGesture(
	editor: Editor,
	input: {
		blockId: string;
		clientX: number;
		clientY: number;
		startedInHostChrome?: boolean;
	},
): PointerSelectionGesture {
	return {
		...input,
		startedInHostChrome: input.startedInHostChrome ?? false,
		anchorPoint: null,
		startSelection: editor.getSelection(),
		promotedDuringDrag: false,
	};
}

export function resolvePointerGestureAnchorPoint(
	gesture: PointerSelectionGesture,
	root: HTMLElement,
): { blockId: string; offset: number } | null {
	if (gesture.anchorPoint) {
		return gesture.anchorPoint;
	}

	if (gesture.startSelection?.type === "text") {
		return gesture.startSelection.anchor;
	}

	return pointToEditorSelectionPoint(root, gesture.clientX, gesture.clientY);
}

export function resolvePointerDragSelection(
	editor: Editor,
	root: HTMLElement,
	gesture: PointerSelectionGesture,
	input: {
		clientX: number;
		clientY: number;
		getBoundaryPoint: (
			blockId: string,
			side: "start" | "end",
		) => { blockId: string; offset: number };
	},
): ResolvedPointerDragSelection | null {
	const focusPoint = pointToEditorSelectionPoint(
		root,
		input.clientX,
		input.clientY,
	);
	if (!focusPoint) {
		return null;
	}

	if (
		gesture.startSelection?.type === "block" &&
		gesture.startSelection.blockIds.includes(gesture.blockId) &&
		focusPoint.blockId !== gesture.blockId
	) {
		const blockIds = resolveBlockIdRange(
			editor.documentState.blockOrder,
			gesture.blockId,
			focusPoint.blockId,
		);
		return blockIds ? { mode: "block", blockIds } : null;
	}

	const anchorPoint = resolvePointerGestureAnchorPoint(gesture, root);
	if (!anchorPoint) {
		return null;
	}
	// Within one block the browser owns the range and the mapped read at
	// mouseup commits it. A drag anchored in host chrome never entered a
	// field, so there is no native range to inherit (FE10) and Pen has to
	// resolve that one itself.
	if (
		focusPoint.blockId === anchorPoint.blockId &&
		(!gesture.startedInHostChrome ||
			focusPoint.offset === anchorPoint.offset)
	) {
		return null;
	}

	const anchorRole = getEditorBlockSelectionRole(editor, anchorPoint.blockId);
	const focusRole = getEditorBlockSelectionRole(editor, focusPoint.blockId);
	if (anchorRole === "editable-inline" && focusRole === "editable-inline") {
		return {
			mode: "mapped-text",
			anchorPoint,
			focusPoint,
		};
	}

	const blockOrder = editor.documentState.blockOrder;
	const anchorIdx = blockOrder.indexOf(anchorPoint.blockId);
	const focusIdx = blockOrder.indexOf(focusPoint.blockId);
	if (anchorIdx < 0 || focusIdx < 0) {
		return null;
	}

	const selectingForward = anchorIdx <= focusIdx;
	// N2: a mid-paragraph drag start must stay at that offset. Snapping
	// the text anchor to the block end made Backspace leave the whole
	// paragraph after a divider-only delete (WebKit / Firefox).
	const normalizedAnchorPoint =
		anchorRole === "editable-inline"
			? anchorPoint
			: input.getBoundaryPoint(
					anchorPoint.blockId,
					selectingForward ? "start" : "end",
				);
	const normalizedFocusPoint =
		focusRole === "editable-inline"
			? focusPoint
			: input.getBoundaryPoint(
					focusPoint.blockId,
					selectingForward ? "end" : "start",
				);

	return {
		mode: "canonical",
		anchorPoint: normalizedAnchorPoint,
		focusPoint: normalizedFocusPoint,
	};
}

function resolveBlockIdRange(
	blockOrder: readonly string[],
	anchorBlockId: string,
	focusBlockId: string,
): string[] | null {
	const anchorIdx = blockOrder.indexOf(anchorBlockId);
	const focusIdx = blockOrder.indexOf(focusBlockId);
	if (anchorIdx < 0 || focusIdx < 0) {
		return null;
	}

	const from = Math.min(anchorIdx, focusIdx);
	const to = Math.max(anchorIdx, focusIdx);
	return blockOrder.slice(from, to + 1);
}
