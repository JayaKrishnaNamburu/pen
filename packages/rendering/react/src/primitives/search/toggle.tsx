import React from "react";
import type { SearchOptions } from "@pen/search";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

export interface SearchToggleProps
	extends AsChildProps,
		Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	ref?: React.Ref<HTMLElement>;
}

export function SearchCaseSensitive(props: SearchToggleProps) {
	return (
		<SearchToggle
			{...props}
			option="caseSensitive"
			dataOption="case-sensitive"
			label="Toggle case-sensitive search"
		/>
	);
}

export function SearchRegExpToggle(props: SearchToggleProps) {
	return (
		<SearchToggle
			{...props}
			option="regex"
			dataOption="regex"
			label="Toggle regular expression search"
		/>
	);
}

export function SearchWholeWord(props: SearchToggleProps) {
	return (
		<SearchToggle
			{...props}
			option="wholeWord"
			dataOption="whole-word"
			label="Toggle whole-word search"
		/>
	);
}

type SearchToggleInternalProps = SearchToggleProps & {
	option: keyof SearchOptions;
	dataOption: "case-sensitive" | "regex" | "whole-word";
	label: string;
};

function SearchToggle(props: SearchToggleInternalProps) {
	const { option, dataOption, label, ...rest } = props;
	const { controller, state } = useSearchContext();
	const active = state.options[option];

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-toggle": "",
		"data-option": dataOption,
		"data-active": active || undefined,
		type: "button",
		"aria-pressed": active,
		"aria-label": label,
		onClick: () => {
			controller?.setOptions({ [option]: !active });
		},
	};

	return renderAsChild(rest, "button", primitiveProps);
}
