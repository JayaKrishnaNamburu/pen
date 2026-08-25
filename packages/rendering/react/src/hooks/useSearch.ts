import { useSyncExternalStore } from "react";
import { searchControllerFacet } from "@input/pen-core";
import type { Editor, Unsubscribe } from "@input/pen-types";
import type { SearchController, SearchState } from "@input/pen-search";

const EMPTY_SEARCH_STATE: SearchState = {
	open: false,
	query: "",
	replaceText: "",
	matches: [],
	activeIndex: -1,
	options: {
		caseSensitive: false,
		regex: false,
		wholeWord: false,
	},
};

export function useSearch(editor: Editor): SearchState {
	const controller =
		(editor.facet(searchControllerFacet) as SearchController | null) ?? null;
	const canReadControllerState = isSearchController(controller);

	return useSyncExternalStore(
		(callback) => {
			if (!canReadControllerState) {
				return () => {};
			}
			return controller.subscribe(callback);
		},
		() => (canReadControllerState ? controller.getState() : EMPTY_SEARCH_STATE),
		() => EMPTY_SEARCH_STATE,
	);
}

function isSearchController(
	controller: SearchController | null,
): controller is SearchController & {
	subscribe(listener: () => void): Unsubscribe;
	getState(): SearchState;
} {
	return (
		typeof controller?.subscribe === "function" &&
		typeof controller?.getState === "function"
	);
}
