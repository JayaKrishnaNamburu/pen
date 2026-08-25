import { isMultiBlock } from "@input/pen-core";
import type { SelectionState } from "@input/pen-types";

/**
 * While the authority spans blocks, a native *range* confined to one block is
 * the engine reporting its own limit, not a user intent. Two paths produce it:
 *
 * - Document select-all. Firefox and WebKit confine it to the active field.
 *   Keyboard is not a gesture window (spec-v2/03-selection.md §4.2), so the
 *   leftover must not write, and P2 must not run either: projecting the
 *   multi-block range makes the engine confine it again.
 * - A pointer drag whose far end is a structural block with no text position,
 *   e.g. a divider. WebKit cannot put a range endpoint there, so it reports
 *   the nearest text end instead — the end of the paragraph the drag started
 *   in. Accepting that would replace the host's structural cover with a
 *   same-block range, and Backspace would trim the paragraph and leave the
 *   divider standing (N2).
 *
 * A *collapsed* proposal is not leftover: a click inside a multi-block
 * selection is real new intent and must collapse it.
 *
 * Owned by `FieldEditorImpl.readDomSelection`, on both the diverge and the
 * accept path. Backends must not pre-filter.
 */
export function isSingleFieldNativeLeftover(
	authority: SelectionState | null | undefined,
	native: {
		type: "text" | "block";
		anchor?: { blockId: string; offset: number };
		focus?: { blockId: string; offset: number };
	},
): boolean {
	if (authority?.type !== "text" || !isMultiBlock(authority)) {
		return false;
	}
	if (native.type !== "text" || !native.anchor || !native.focus) {
		return false;
	}
	if (native.anchor.blockId !== native.focus.blockId) {
		return false;
	}
	return native.anchor.offset !== native.focus.offset;
}
