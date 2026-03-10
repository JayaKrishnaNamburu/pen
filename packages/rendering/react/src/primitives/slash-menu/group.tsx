import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";

export interface SlashMenuGroupProps extends AsChildProps {
  heading?: string;
  ref?: React.Ref<HTMLElement>;
}

export function SlashMenuGroup(props: SlashMenuGroupProps) {
  const { heading, children, ...rest } = props;

  const primitiveProps: Record<string, unknown> = {
    "data-pen-slash-menu-group": "",
    role: "group",
    "aria-label": heading,
  };

  const content = (
    <>
      {heading && (
        <div data-pen-slash-menu-group-heading="" role="presentation">
          {heading}
        </div>
      )}
      {children}
    </>
  );

  return renderAsChild({ ...rest, children: content }, "div", primitiveProps);
}
