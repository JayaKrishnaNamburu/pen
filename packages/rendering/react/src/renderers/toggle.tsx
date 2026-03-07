import React from "react";
import type { BlockHandle, BlockRenderContext } from "@pen/core";
import { InlineContent } from "../primitives/editor/inlineContent.js";
import { useEditorContext } from "../context/editorContext.js";

export function ToggleRenderer(
  block: BlockHandle,
  ctx: BlockRenderContext,
): React.ReactElement {
  const open = (block.props?.open as boolean) ?? false;

  const childHandles = block.children;
  const childElements = childHandles.map((child) => (
    <ToggleChild key={child.id} blockId={child.id} />
  ));

  return (
    <div
      ref={ctx.ref as React.Ref<HTMLDivElement>}
      data-block-type="toggle"
      data-selected={ctx.selected || undefined}
    >
      <ToggleDetails blockId={block.id} open={open}>
        <summary>
          <InlineContent blockId={block.id} />
        </summary>
        {open && childElements.length > 0 ? (
          <div data-pen-toggle-body="">{childElements}</div>
        ) : null}
      </ToggleDetails>
    </div>
  );
}

function ToggleDetails({
  blockId,
  open,
  children,
}: {
  blockId: string;
  open: boolean;
  children: React.ReactNode;
}) {
  const { editor, readonly } = useEditorContext();

  const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (readonly) return;
    const newOpen = (event.target as HTMLDetailsElement).open;
    if (newOpen !== open) {
      editor.apply([
        {
          type: "update-block",
          blockId,
          props: { open: newOpen },
        },
      ]);
    }
  };

  return (
    <details open={open || undefined} onToggle={handleToggle}>
      {children}
    </details>
  );
}

function ToggleChild({ blockId }: { blockId: string }) {
  const { editor } = useEditorContext();
  const block = editor.getBlock(blockId);
  if (!block) return null;

  return (
    <div data-block-type={block.type} data-block-id={blockId}>
      <InlineContent blockId={blockId} />
    </div>
  );
}
