import React, { createContext, useContext } from "react";
import { searchControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import type { SearchController, SearchState } from "@input/pen-search";
import { useSearch } from "../../hooks/useSearch";
import { EditorContext } from "../../context/editorContext";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
export interface SearchContextValue {
	editor: Editor;
	state: SearchState;
	controller: SearchController | null;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearchContext(): SearchContextValue {
	const ctx = useContext(SearchContext);
	if (!ctx) {
		throw new Error("Missing Pen.Search.Root context");
	}
	return ctx;
}

export interface SearchRootProps extends AsChildProps {
	editor?: Editor;
	ref?: React.Ref<HTMLElement>;
}

export function SearchRoot(props: SearchRootProps) {
	const { editor: editorProp, ...rest } = props;
	const editorContext = useContext(EditorContext);
	const editor = editorProp ?? editorContext?.editor;

	if (!editor) {
		throw new Error("Missing editor for Pen.Search.Root");
	}

	const state = useSearch(editor);
	const controller =
		(editor.facet(searchControllerFacet) as SearchController | null) ?? null;
	const ctx: SearchContextValue = {
		editor,
		state,
		controller,
	};

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-root": "",
		role: "search",
		"data-open": state.open ? "" : undefined,
		"data-has-controller": controller ? "" : undefined,
		"data-has-matches": state.matches.length > 0 ? "" : undefined,
		"data-match-count": state.matches.length,
	};

	return (
		<SearchContext.Provider value={ctx}>
			{renderAsChild(rest, "div", primitiveProps)}
		</SearchContext.Provider>
	);
}
