import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

type SearchResultsRenderProps = {
	count: number;
	active: number;
};

export interface SearchResultsProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
		Omit<AsChildProps, "children"> {
	children?: React.ReactNode | ((state: SearchResultsRenderProps) => React.ReactNode);
	ref?: React.Ref<HTMLElement>;
}

export function SearchResults(props: SearchResultsProps) {
	const { children, ...rest } = props;
	const { state } = useSearchContext();

	const count = state.matches.length;
	const active = count === 0 ? 0 : state.activeIndex + 1;

	let content: React.ReactNode;
	if (typeof children === "function") {
		content = children({ count, active });
	} else if (children != null) {
		content = children;
	} else if (count === 0) {
		content = "No matches";
	} else {
		content = `${active} of ${count} matches`;
	}

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-results": "",
		"data-count": count,
		"data-active-index": state.activeIndex,
	};

	return renderAsChild({ ...rest, children: content }, "div", primitiveProps);
}
