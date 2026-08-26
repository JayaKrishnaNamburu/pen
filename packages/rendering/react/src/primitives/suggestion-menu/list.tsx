import React from "react";
import { resolveEditorMessage } from "@input/pen-core";
import { DEFAULT_MESSAGE_CATALOG } from "@input/pen-types";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useSuggestionMenuContext } from "./root";

export interface SuggestionMenuListProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

/** AX3 caret-anchored popup: `role="listbox"` with owned option IDs. */
export function SuggestionMenuList(props: SuggestionMenuListProps) {
	const { editor, getOptionId, items, open, popupId, selectedIndex } =
		useSuggestionMenuContext();
	const activeOptionId =
		open && items.length > 0 ? getOptionId(selectedIndex) : undefined;
	const listLabel = editor
		? resolveEditorMessage(editor, "pen.suggestion.list.label")
		: DEFAULT_MESSAGE_CATALOG["pen.suggestion.list.label"];

	return renderAsChild(props, "div", {
		id: popupId,
		"data-pen-suggestion-menu-list": "",
		hidden: open ? undefined : true,
		role: open ? "listbox" : undefined,
		"aria-label": open ? listLabel : undefined,
		"aria-activedescendant": activeOptionId,
	});
}
