import React from "react";
import { resolveEditorMessage } from "@input/pen-core";
import { DEFAULT_MESSAGE_CATALOG } from "@input/pen-types";
import { getSlashMenuOptionId, useSlashMenuContext } from "./root";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";

export interface SlashMenuInputProps extends AsChildProps {
	placeholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function SlashMenuInput(props: SlashMenuInputProps) {
	const { items, listboxId, open, query, selectedIndex, setQuery, editor } =
		useSlashMenuContext();
	const { placeholder = editor
		? resolveEditorMessage(editor, "pen.slash.input.placeholder")
		: DEFAULT_MESSAGE_CATALOG["pen.slash.input.placeholder"], ...rest } = props;
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
