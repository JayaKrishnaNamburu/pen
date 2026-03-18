import React, { createContext, useContext } from "react";
import type { Editor } from "@pen/types";
import {
	getSearchController,
	type SearchController,
	type SearchState,
} from "@pen/search";
import { useSearch } from "../../hooks/useSearch";
import { EditorContext } from "../../context/editorContext";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { isDevelopmentEnvironment } from "../../utils/environment";

export interface SearchContextValue {
	editor: Editor;
	state: SearchState;
	controller: SearchController | null;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearchContext(): SearchContextValue {
	const ctx = useContext(SearchContext);
	if (!ctx) {
		if (isDevelopmentEnvironment()) {
			console.error(
				"Pen: useSearchContext must be used within <Pen.Search.Root>.",
			);
		}
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
		if (isDevelopmentEnvironment()) {
			console.error(
				"Pen: <Pen.Search.Root> must be used within <Pen.Editor.Root> or receive an editor prop.",
			);
		}
		throw new Error("Missing editor for Pen.Search.Root");
	}

	const state = useSearch(editor);
	const controller = getSearchController(editor);
	const ctx: SearchContextValue = {
		editor,
		state,
		controller,
	};

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-root": "",
		"data-open": state.open || undefined,
		"data-has-controller": controller ? "" : undefined,
		"data-has-matches": state.matches.length > 0 || undefined,
		"data-match-count": state.matches.length,
	};

	return (
		<SearchContext.Provider value={ctx}>
			{renderAsChild(rest, "div", primitiveProps)}
		</SearchContext.Provider>
	);
}
