import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

export interface SearchNavigationButtonProps
	extends AsChildProps,
		Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	ref?: React.Ref<HTMLElement>;
}

export function SearchNext(props: SearchNavigationButtonProps) {
	return (
		<SearchNavigationButton
			{...props}
			dataOption="next"
			label="Next match"
			onAction={(controller) => controller?.next()}
		/>
	);
}

export function SearchPrevious(props: SearchNavigationButtonProps) {
	return (
		<SearchNavigationButton
			{...props}
			dataOption="previous"
			label="Previous match"
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
