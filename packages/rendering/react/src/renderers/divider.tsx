import React from "react";
import type { BlockHandle, BlockRenderContext } from "@input/pen-types";

export function DividerRenderer(
  _block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  return (
    <hr
      ref={ctx.ref as React.Ref<HTMLHRElement>}
      data-block-type="divider"
      data-selected={ctx.selected ? "" : undefined}
    />
  );
}
