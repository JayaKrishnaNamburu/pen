import React from "react";
import { resolveSchemaA11y } from "@input/pen-core";
import { urlPolicy } from "@input/pen-dom";
import type { BlockHandle, BlockRenderContext } from "@input/pen-types";
import { useEditorContext } from "../context/editorContext";

export function ImageRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  return <ImageFigure block={block} ctx={ctx} />;
}

function ImageFigure({
  block,
  ctx,
}: {
  block: BlockHandle;
  ctx: BlockRenderContext;
}) {
  const { editor } = useEditorContext();
  const src = urlPolicy.resolve(block.props?.src, "image");
  const caption = (block.props?.caption as string) ?? "";
  const width = block.props?.width as number | undefined;
  const a11y = resolveSchemaA11y(editor, {
    kind: "block",
    type: block.type,
    props: { ...block.props },
  });

  return (
    <figure
      ref={ctx.ref as React.Ref<HTMLElement>}
      data-block-type="image"
      data-selected={ctx.selected ? "" : undefined}
    >
      <img
        src={src ?? undefined}
        alt={a11y.label}
        aria-roledescription={a11y.roleDescription}
        data-pen-blocked-url={src == null ? "" : undefined}
        style={width ? { width: `${width}px` } : undefined}
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
