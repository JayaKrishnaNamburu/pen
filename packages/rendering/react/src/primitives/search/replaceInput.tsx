import React from "react";
import { resolveEditorMessage } from "@input/pen-core";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

export interface SearchReplaceInputProps
	extends AsChildProps,
		Omit<React.InputHTMLAttributes<HTMLInputElement>, "children"> {
	placeholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function SearchReplaceInput(props: SearchReplaceInputProps) {
	const { state, controller, editor } = useSearchContext();
	const { placeholder = resolveEditorMessage(editor, "pen.search.replace.placeholder"), ...rest } = props;

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-replace-input": "",
		type: "text",
		placeholder,
		"aria-label": resolveEditorMessage(editor, "pen.search.replace.label"),
		value: state.replaceText,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
			controller?.setReplaceText(event.target.value);
		},
	};

	return renderAsChild(rest, "input", primitiveProps);
}
