import React from "react";
import { composeRefs } from "./composeRefs";

export interface AsChildProps {
  asChild?: boolean;
  children?: React.ReactNode;
}

export function renderAsChild(
  props: AsChildProps & { ref?: React.Ref<HTMLElement> } & Record<string, any>,
  defaultTag: keyof React.JSX.IntrinsicElements,
  primitiveProps: Record<string, unknown>,
): React.ReactElement {
  const { asChild, children, ref, ...restProps } = props;

  if (asChild && React.isValidElement(children)) {
    const child = React.Children.only(children) as React.ReactElement<any>;
    return React.cloneElement(child, {
      ...primitiveProps,
      ...restProps,
      ...child.props,
      ref: composeRefs(ref, (child as { ref?: React.Ref<unknown> }).ref),
    });
  }

  return React.createElement(
    defaultTag,
    { ...primitiveProps, ...restProps, ref },
    children,
  );
}
