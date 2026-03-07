import React from "react";
import { useSlashMenuContext } from "./root.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";

export interface SlashMenuInputProps extends AsChildProps {
  placeholder?: string;
  ref?: React.Ref<HTMLElement>;
}

export function SlashMenuInput(props: SlashMenuInputProps) {
  const { placeholder = "Search blocks...", ...rest } = props;
  const { query, setQuery } = useSlashMenuContext();

  const primitiveProps: Record<string, unknown> = {
    "data-pen-slash-menu-input": "",
    type: "text",
    role: "combobox",
    "aria-autocomplete": "list",
    placeholder,
    value: query,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setQuery(e.target.value),
  };

  return renderAsChild(rest, "input", primitiveProps);
}
