import React from "react";
import type { BlockHandle, BlockRenderContext } from "@pen/core";
import { InlineContent } from "../primitives/editor/inlineContent.js";
import { useEditorContext } from "../context/editorContext.js";

export function CheckListItemRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  const indent = (block.props?.indent as number) ?? 0;
  const checked = (block.props?.checked as boolean) ?? false;

  return (
    <div
      ref={ctx.ref as React.Ref<HTMLDivElement>}
      data-block-type="checkListItem"
      data-indent={indent}
      data-checked={checked || undefined}
      data-selected={ctx.selected || undefined}
      style={{ paddingLeft: `${indent * 24}px` }}
    >
      <CheckboxToggle blockId={block.id} checked={checked} />
      <InlineContent blockId={block.id} />
    </div>
  );
}

function CheckboxToggle({
  blockId,
  checked,
}: {
  blockId: string;
  checked: boolean;
}) {
  const { editor, readonly } = useEditorContext();

  const handleChange = () => {
    if (readonly) return;
    editor.apply([
      {
        type: "update-block",
        blockId,
        props: { checked: !checked },
      },
    ]);
  };

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={handleChange}
      aria-label="Toggle checkbox"
    />
  );
}
