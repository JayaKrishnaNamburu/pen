import React, { useState } from "react";
import { useEditorContext } from "../../context/editorContext";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { DATA_ATTRS } from "../../utils/dataAttributes";

export interface BlockHandleProps extends AsChildProps {
  blockId: string;
  ref?: React.Ref<HTMLElement>;
}

export function EditorBlockHandle(props: BlockHandleProps) {
  const { blockId, ...rest } = props;
  const { editor, readonly } = useEditorContext();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (event: React.DragEvent) => {
    if (readonly) {
      event.preventDefault();
      return;
    }
    setIsDragging(true);
    event.dataTransfer.setData("application/x-pen-block-id", blockId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (readonly) return;
    if (event.dataTransfer.types.includes("application/x-pen-block-id")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    if (readonly) return;
    event.preventDefault();
    const sourceBlockId = event.dataTransfer.getData("application/x-pen-block-id");
    if (!sourceBlockId || sourceBlockId === blockId) return;

    editor.apply([
      {
        type: "move-block",
        blockId: sourceBlockId,
        position: { before: blockId },
      },
    ]);
  };

  const primitiveProps: Record<string, unknown> = {
    [DATA_ATTRS.blockHandle]: "",
    [DATA_ATTRS.blockId]: blockId,
    [DATA_ATTRS.dragging]: isDragging || undefined,
    draggable: !readonly,
    role: "button",
    "aria-label": "Drag to reorder block",
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  };

  return renderAsChild(rest, "div", primitiveProps);
}
