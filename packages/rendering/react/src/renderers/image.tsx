import React from "react";
import { urlPolicy } from "@input/pen-dom";
import type { BlockHandle, BlockRenderContext } from "@input/pen-types";

export function ImageRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  const src = urlPolicy.resolve(block.props?.src, "image");
  const alt = (block.props?.alt as string) ?? "";
  const caption = (block.props?.caption as string) ?? "";
  const width = block.props?.width as number | undefined;

  return (
    <figure
      ref={ctx.ref as React.Ref<HTMLElement>}
      data-block-type="image"
      data-selected={ctx.selected || undefined}
    >
      <img
        src={src ?? undefined}
        alt={alt}
        data-pen-blocked-url={src == null ? "" : undefined}
        style={width ? { width: `${width}px` } : undefined}
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
