import React from "react";
import type { BlockHandle, BlockRenderContext } from "@pen/core";
import { InlineContent } from "../primitives/editor/inlineContent.js";

export function BulletListItemRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  const indent = (block.props?.indent as number) ?? 0;

  return (
    <div
      ref={ctx.ref as React.Ref<HTMLDivElement>}
      data-block-type="bulletListItem"
      data-indent={indent}
      data-selected={ctx.selected || undefined}
      style={{ paddingLeft: `${indent * 24}px` }}
    >
      <InlineContent blockId={block.id} />
    </div>
  );
}
