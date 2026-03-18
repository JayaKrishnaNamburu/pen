import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

export interface SearchInputProps
	extends AsChildProps,
		Omit<React.InputHTMLAttributes<HTMLInputElement>, "children"> {
	placeholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function SearchInput(props: SearchInputProps) {
	const { placeholder = "Search...", ...rest } = props;
	const { state, controller } = useSearchContext();

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-input": "",
		type: "text",
		role: "searchbox",
		placeholder,
		value: state.query,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
			controller?.setQuery(event.target.value);
		},
	};

	return renderAsChild(rest, "input", primitiveProps);
}
