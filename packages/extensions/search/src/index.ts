export {
	searchExtension,
	SEARCH_EXTENSION_NAME,
	getSearchController,
} from "./extension";

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
	findDocumentMatches,
	getNextActiveIndex,
	getPreviousActiveIndex,
} from "./search";

export type {
	SearchController,
	SearchMatch,
	SearchOptions,
	SearchState,
} from "./types";
