import React from "react";
import { getSlashMenuOptionId, useSlashMenuContext } from "./root";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";

export interface SlashMenuInputProps extends AsChildProps {
	placeholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function SlashMenuInput(props: SlashMenuInputProps) {
	const { placeholder = "Search blocks...", ...rest } = props;
	const { items, listboxId, open, query, selectedIndex, setQuery } =
		useSlashMenuContext();
	const activeOptionId =
		open && items.length > 0
			? getSlashMenuOptionId(listboxId, selectedIndex)
			: undefined;

	const primitiveProps: Record<string, unknown> = {
		"data-pen-slash-menu-input": "",
		type: "text",
		role: "combobox",
		"aria-autocomplete": "list",
		"aria-controls": listboxId,
		"aria-expanded": open,
		"aria-activedescendant": activeOptionId,
		placeholder,
		value: query,
		onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
			setQuery(e.target.value),
	};

	return renderAsChild(rest, "input", primitiveProps);
}
