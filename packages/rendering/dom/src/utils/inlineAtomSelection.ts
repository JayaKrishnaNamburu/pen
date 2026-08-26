import { isCollapsed } from "@input/pen-core";
import type { SelectionState } from "@input/pen-types";

export function isInlineAtomSelected(
	selection: SelectionState,
	blockId: string,
	offset: number,
): boolean {
	if (
		selection?.type !== "text" ||
		isCollapsed(selection) ||
		selection.anchor.blockId !== blockId ||
		selection.focus.blockId !== blockId
	) {
		return false;
	}

	const selectionStart = Math.min(
		selection.anchor.offset,
		selection.focus.offset,
	);
	const selectionEnd = Math.max(
		selection.anchor.offset,
		selection.focus.offset,
	);
	return selectionStart <= offset && selectionEnd >= offset + 1;
}
