import React from "react";
import { composeRefs } from "./composeRefs";

export interface AsChildProps {
  asChild?: boolean;
  children?: React.ReactNode;
}

type AsChildElementProps = Record<string, unknown>;
type AsChildElement = React.ReactElement<AsChildElementProps>;

export function renderAsChild(
  props: AsChildProps &
    { ref?: React.Ref<HTMLElement> } &
    object,
  defaultTag: keyof React.JSX.IntrinsicElements,
  primitiveProps: Record<string, unknown>,
): React.ReactElement {
  const { asChild, children, ref, ...restProps } = props;

  if (asChild && React.isValidElement<AsChildElementProps>(children)) {
    const child = React.Children.only(children) as AsChildElement;
    return React.cloneElement(child, {
      ...primitiveProps,
      ...restProps,
      ...child.props,
      ref: composeRefs(ref, (child as AsChildElement & { ref?: React.Ref<unknown> }).ref),
    });
  }

  return React.createElement(
    defaultTag,
    { ...primitiveProps, ...restProps, ref },
    children,
  );
}
