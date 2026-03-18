import type { InlineDecoration } from "@pen/types";
import type { SearchState } from "./types";

export function buildSearchDecorations(
	state: SearchState,
): InlineDecoration[] {
	if (!state.open || state.matches.length === 0) {
		return [];
	}

	return state.matches.flatMap((match, index) => {
		// The core decoration model only targets block text ranges today.
		// Table and database matches stay visible through controller state and
		// active-cell selection until cell-scoped decorations exist.
		if (match.kind !== "block") {
			return [];
		}
		const isActive = index === state.activeIndex;
		return [{
			type: "inline",
			blockId: match.blockId,
			from: match.from,
			to: match.to,
			attributes: {
				class: isActive
					? "pen-search-match pen-search-match-active"
					: "pen-search-match",
				"data-pen-search-match": "",
				"data-search-match-index": String(match.index),
				"data-search-match-active": String(isActive),
			},
		}];
	});
}
