import React from "react";
import { resolveEditorMessage } from "@input/pen-core";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

export interface SearchInputProps
	extends
		AsChildProps,
		Omit<React.InputHTMLAttributes<HTMLInputElement>, "children"> {
	placeholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function SearchInput(props: SearchInputProps) {
	const { state, controller, editor } = useSearchContext();
	const {
		placeholder = resolveEditorMessage(
			editor,
			"pen.search.input.placeholder",
		),
		...rest
	} = props;

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-input": "",
		type: "text",
		role: "searchbox",
		placeholder,
		"aria-label": resolveEditorMessage(editor, "pen.search.input.label"),
		value: state.query,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
			controller?.setQuery(event.target.value);
		},
	};

	return renderAsChild(rest, "input", primitiveProps);
}
