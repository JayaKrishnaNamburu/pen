export {
	searchExtension,
	SEARCH_EXTENSION_NAME,
	SEARCH_CONTROLLER_SLOT,
	getSearchController,
} from "./extension";

export { SearchControllerImpl } from "./controller";

export {
	DEFAULT_SEARCH_LOCALE,
	DEFAULT_SEARCH_OPTIONS,
	SEARCH_BUDGET_EXCEEDED_CODE,
	SEARCH_EXECUTION_BUDGET_MS,
	SEARCH_INVALID_PATTERN_CODE,
	SEARCH_QUERY_MAX_LENGTH,
	SEARCH_REGEX_SEGMENT_MAX_CODE_UNITS,
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
