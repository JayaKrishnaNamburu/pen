import React from "react";
import type { BlockHandle, BlockRenderContext } from "@pen/core";

export function DefaultRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    console.warn(
      `Pen: No renderer registered for block type "${block.type}". ` +
        "Using DefaultRenderer. Register a custom renderer to fix this.",
    );
  }

  return (
    <div
      ref={ctx.ref as React.Ref<HTMLDivElement>}
      data-block-type={block.type}
      data-selected={ctx.selected || undefined}
      data-unknown-block=""
    >
      <span data-pen-unknown-type="">{block.type}</span>
      {typeof process !== "undefined" && process.env.NODE_ENV !== "production" && (
        <pre data-pen-unknown-props="">
          {JSON.stringify(block.props, null, 2)}
        </pre>
      )}
    </div>
  );
}
