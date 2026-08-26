import type { Editor } from "@input/pen-types";
import { rejectSuggestions } from "./acceptReject";
import { readAllSuggestions } from "./persistent";

/**
 * Rejects every suggestion sitting on the given blocks.
 *
 * Withdrawing a staged write is not the same as deleting its block: under the
 * suggestions posture the block carries a marker, and removing the block while
 * leaving the marker behind would strand it in the review surface. Rejecting is
 * the operation that undoes both.
 */
export function rejectSuggestionsForBlocks(
	editor: Editor,
	blockIds: readonly string[],
	undoGroupId?: string | null,
): void {
	if (blockIds.length === 0) {
		return;
	}
	const targets = new Set(blockIds);
	const suggestionIds = readAllSuggestions(editor)
		.filter((suggestion) => targets.has(suggestion.blockId))
		.map((suggestion) => suggestion.id);
	if (suggestionIds.length === 0) {
		return;
	}
	rejectSuggestions(editor, suggestionIds, {
		origin: "ai",
		undoGroupId: undoGroupId ?? undefined,
	});
}
