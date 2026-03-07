import React from "react";
import type { BlockHandle, BlockRenderContext } from "@pen/core";
import { InlineContent } from "../primitives/editor/inlineContent.js";

export function BlockquoteRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  const childHandles = block.children;
  const childElements = childHandles.map((child) => (
    <BlockquoteChild key={child.id} child={child} />
  ));

  return (
    <blockquote
      ref={ctx.ref as React.Ref<HTMLQuoteElement>}
      data-block-type="blockquote"
      data-selected={ctx.selected || undefined}
    >
      <InlineContent blockId={block.id} />
      {childElements.length > 0 ? (
        <div data-pen-blockquote-children="">{childElements}</div>
      ) : null}
    </blockquote>
  );
}

function BlockquoteChild({ child }: { child: BlockHandle }) {
  return (
    <div data-block-type={child.type} data-block-id={child.id}>
      <InlineContent blockId={child.id} />
    </div>
  );
}
