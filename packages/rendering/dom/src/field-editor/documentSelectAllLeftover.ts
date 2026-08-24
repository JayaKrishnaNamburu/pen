import { isMultiBlock } from "@input/pen-core";
import type { SelectionState } from "@input/pen-types";

/**
 * After document select-all, per-field contenteditable cannot hold a
 * multi-block native range. Firefox (and sometimes WebKit) collapses native
 * onto the active field. Keyboard is not a gesture window
 * (spec-v2/03-selection.md §4.2): that leftover must not write, and P2
 * must not run (projecting the multi-block range collapses again).
 *
 * Owned by `FieldEditorImpl.readDomSelection` on the diverge path. Backends
 * must not pre-filter — an open pointer window still accepts a click.
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
