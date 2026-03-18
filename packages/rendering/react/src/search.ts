export {
	SearchRoot,
	SearchInput,
	SearchResults,
	SearchNext,
	SearchPrevious,
	SearchReplaceInput,
	SearchReplace,
	SearchReplaceAll,
	SearchCaseSensitive,
	SearchRegExpToggle,
	SearchWholeWord,
	useSearchContext,
	type SearchRootProps,
	type SearchInputProps,
	type SearchResultsProps,
	type SearchNavigationButtonProps,
	type SearchReplaceInputProps,
	type SearchReplaceButtonProps,
	type SearchToggleProps,
	type SearchContextValue,
} from "./primitives/search/index";
export { useSearch } from "./hooks/useSearch";
export type {
	SearchController,
	SearchMatch,
	SearchOptions,
	SearchState,
} from "@pen/search";
