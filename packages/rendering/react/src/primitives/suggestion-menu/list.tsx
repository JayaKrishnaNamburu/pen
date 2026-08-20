import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSuggestionMenuContext } from "./root";

export interface SuggestionMenuListProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

/** AX3 caret-anchored popup: `role="listbox"` with owned option IDs. */
export function SuggestionMenuList(props: SuggestionMenuListProps) {
	const { getOptionId, items, popupId, selectedIndex } =
		useSuggestionMenuContext();
	const activeOptionId =
		items.length > 0 ? getOptionId(selectedIndex) : undefined;

	return renderAsChild(props, "div", {
		id: popupId,
		"data-pen-suggestion-menu-list": "",
		role: "listbox",
		"aria-activedescendant": activeOptionId,
	});
}
