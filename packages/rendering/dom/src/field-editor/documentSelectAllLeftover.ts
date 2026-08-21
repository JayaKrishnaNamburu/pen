import { isMultiBlock } from "@input/pen-core";
import type { SelectionState } from "@input/pen-types";

/**
 * After document select-all, per-field contenteditable cannot hold a
 * multi-block native range. Firefox (and sometimes WebKit) collapses native
 * onto the active field and `selectionchange` would otherwise overwrite
 * authority. Keyboard is not a gesture window (spec-v2/03-selection.md §4.2):
 * that leftover must not write the authority.
 */
export function shouldIgnoreLeftoverFieldAfterDocumentSelectAll(
	authority: SelectionState | null | undefined,
	native: {
		type: "text" | "block";
		anchor?: { blockId: string };
		focus?: { blockId: string };
	},
): boolean {
	if (authority?.type !== "text" || !isMultiBlock(authority)) {
		return false;
	}
	if (native.type !== "text" || !native.anchor || !native.focus) {
		return false;
	}
	return native.anchor.blockId === native.focus.blockId;
}
