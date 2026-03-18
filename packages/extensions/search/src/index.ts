export {
	searchExtension,
	SEARCH_EXTENSION_NAME,
	SEARCH_CONTROLLER_SLOT,
	getSearchController,
} from "./extension";

export { SearchControllerImpl } from "./controller";

export {
	DEFAULT_SEARCH_OPTIONS,
	buildReplaceAllOps,
	buildReplaceOps,
	buildSearchRegex,
	createInitialSearchState,
	findDocumentMatches,
	getNextActiveIndex,
	getPreviousActiveIndex,
	normalizeActiveIndex,
	revealActiveMatch,
} from "./search";

export type {
	SearchController,
	SearchMatch,
	SearchOptions,
	SearchState,
} from "./types";
