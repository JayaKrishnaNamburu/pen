import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";

export interface ToolbarGroupProps extends AsChildProps {
  ref?: React.Ref<HTMLElement>;
}

export function ToolbarGroup(props: ToolbarGroupProps) {
  return renderAsChild(props, "div", {
    role: "group",
    "data-pen-toolbar-group": "",
  });
}
