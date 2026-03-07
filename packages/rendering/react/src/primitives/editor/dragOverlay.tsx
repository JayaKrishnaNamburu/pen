import React, { useEffect, useState } from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";

export interface DragOverlayProps extends AsChildProps {
  ref?: React.Ref<HTMLElement>;
}

/**
 * Ghost element during block drag.
 * Client-only — renders null during SSR.
 */
export function EditorDragOverlay(props: DragOverlayProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("application/x-pen-block-id")) {
        setIsDragging(true);
        setPosition({ x: event.clientX, y: event.clientY });
      }
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      setPosition(null);
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDragEnd);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDragEnd);
    };
  }, []);

  if (typeof window === "undefined" || !isDragging || !position) return null;

  return renderAsChild(props, "div", {
    "data-pen-drag-overlay": "",
    "aria-hidden": "true",
    style: {
      position: "fixed",
      left: `${position.x + 12}px`,
      top: `${position.y + 12}px`,
      pointerEvents: "none",
      opacity: 0.5,
      zIndex: 9999,
    },
  });
}
