import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSearchContext } from "./root";

export interface SearchReplaceButtonProps
	extends AsChildProps,
		Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	ref?: React.Ref<HTMLElement>;
}

export function SearchReplace(props: SearchReplaceButtonProps) {
	return (
		<SearchReplaceButton
			{...props}
			action="replace"
			label="Replace match"
			onAction={(controller) => controller?.replace()}
		/>
	);
}

export function SearchReplaceAll(props: SearchReplaceButtonProps) {
	return (
		<SearchReplaceButton
			{...props}
			action="replace-all"
			label="Replace all matches"
			onAction={(controller) => controller?.replaceAll()}
		/>
	);
}

type SearchReplaceButtonInternalProps = SearchReplaceButtonProps & {
	action: "replace" | "replace-all";
	label: string;
	onAction: (controller: ReturnType<typeof useSearchContext>["controller"]) => void;
};

function SearchReplaceButton(props: SearchReplaceButtonInternalProps) {
	const { action, label, onAction, ...rest } = props;
	const { controller, state } = useSearchContext();
	const disabled = state.matches.length === 0;

	const primitiveProps: Record<string, unknown> = {
		"data-pen-search-replace-button": "",
		"data-action": action,
		type: "button",
		disabled,
		"aria-label": label,
		onClick: () => {
			onAction(controller);
		},
	};

	return renderAsChild(rest, "button", primitiveProps);
}
