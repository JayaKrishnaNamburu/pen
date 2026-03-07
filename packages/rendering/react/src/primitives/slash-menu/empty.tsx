import React from "react";
import { useSlashMenuContext } from "./root.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";

export interface SlashMenuEmptyProps extends AsChildProps {
  ref?: React.Ref<HTMLElement>;
}

export function SlashMenuEmpty(props: SlashMenuEmptyProps) {
  const { items, open } = useSlashMenuContext();

  if (!open || items.length > 0) return null;

  return renderAsChild(props, "div", {
    "data-pen-slash-menu-empty": "",
    role: "presentation",
  });
}
