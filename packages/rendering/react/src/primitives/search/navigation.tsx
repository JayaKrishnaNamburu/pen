import React from "react";
import { resolveEditorMessage } from "@input/pen-core";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

export interface SearchNavigationButtonProps
	extends AsChildProps,
		Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	ref?: React.Ref<HTMLElement>;
}

export function SearchNext(props: SearchNavigationButtonProps) {
	const { editor } = useSearchContext();
	return (
		<SearchNavigationButton
			{...props}
			dataOption="next"
			label={resolveEditorMessage(editor, "pen.search.next")}
			onAction={(controller) => controller?.next()}
		/>
	);
}

export function SearchPrevious(props: SearchNavigationButtonProps) {
	const { editor } = useSearchContext();
	return (
		<SearchNavigationButton
			{...props}
			dataOption="previous"
			label={resolveEditorMessage(editor, "pen.search.previous")}
			onAction={(controller) => controller?.previous()}
		/>
	);
}

type SearchNavigationButtonInternalProps = SearchNavigationButtonProps & {
	dataOption: "next" | "previous";
	label: string;
	onAction: (controller: ReturnType<typeof useSearchContext>["controller"]) => void;
};

function SearchNavigationButton(props: SearchNavigationButtonInternalProps) {
	const { dataOption, label, onAction, ...rest } = props;
	const { controller, state } = useSearchContext();
	const disabled = state.matches.length === 0;

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-navigation": "",
		"data-option": dataOption,
		type: "button",
		disabled,
		"aria-label": label,
		onClick: () => {
			onAction(controller);
		},
	};

	return renderAsChild(rest, "button", primitiveProps);
}
