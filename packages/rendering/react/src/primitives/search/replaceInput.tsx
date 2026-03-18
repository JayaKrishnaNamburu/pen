import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

export interface SearchReplaceInputProps
	extends AsChildProps,
		Omit<React.InputHTMLAttributes<HTMLInputElement>, "children"> {
	placeholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function SearchReplaceInput(props: SearchReplaceInputProps) {
	const { placeholder = "Replace...", ...rest } = props;
	const { state, controller } = useSearchContext();

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-replace-input": "",
		type: "text",
		placeholder,
		value: state.replaceText,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
			controller?.setReplaceText(event.target.value);
		},
	};

	return renderAsChild(rest, "input", primitiveProps);
}
