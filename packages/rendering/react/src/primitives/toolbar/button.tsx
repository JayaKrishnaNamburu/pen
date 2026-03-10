import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";

export interface ToolbarButtonProps extends AsChildProps {
  onAction?: () => void;
  disabled?: boolean;
  ref?: React.Ref<HTMLElement>;
}

export function ToolbarButton(props: ToolbarButtonProps) {
  const { onAction, disabled, ...rest } = props;

  const primitiveProps: Record<string, unknown> = {
    "data-pen-toolbar-button": "",
    role: "button",
    "aria-disabled": disabled || undefined,
    onClick: disabled ? undefined : onAction,
  };

  return renderAsChild(rest, "button", primitiveProps);
}
