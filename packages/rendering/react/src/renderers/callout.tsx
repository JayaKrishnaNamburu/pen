import React from "react";
import type { BlockHandle, BlockRenderContext } from "@pen/core";
import { InlineContent } from "../primitives/editor/inlineContent.js";

export function CalloutRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  const calloutType = (block.props?.type as string) ?? "info";

  const childHandles = block.children;
  const childElements = childHandles.map((child) => (
    <CalloutChild key={child.id} child={child} />
  ));

  const iconMap: Record<string, string> = {
    info: "\u2139\uFE0F",
    warning: "\u26A0\uFE0F",
    error: "\u274C",
  };

  return (
    <div
      ref={ctx.ref as React.Ref<HTMLDivElement>}
      data-block-type="callout"
      data-callout-type={calloutType}
      data-selected={ctx.selected || undefined}
      role="note"
    >
      <span data-pen-callout-icon="" aria-hidden="true">
        {iconMap[calloutType] ?? iconMap.info}
      </span>
      <div data-pen-callout-body="">
        <InlineContent blockId={block.id} />
        {childElements.length > 0 ? (
          <div data-pen-callout-children="">{childElements}</div>
        ) : null}
      </div>
    </div>
  );
}

function CalloutChild({ child }: { child: BlockHandle }) {
  return (
    <div data-block-type={child.type} data-block-id={child.id}>
      <InlineContent blockId={child.id} />
    </div>
  );
}
