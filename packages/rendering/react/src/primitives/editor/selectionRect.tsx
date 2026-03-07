import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditorContext } from "../../context/editorContext.js";
import { useSelection } from "../../hooks/useSelection.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";

export interface SelectionRectProps extends AsChildProps {
  ref?: React.Ref<HTMLElement>;
}

export function EditorSelectionRect(props: SelectionRectProps) {
  const { editor } = useEditorContext();
  const selection = useSelection(editor);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number>(0);

  const isBlockSelection = selection?.type === "block" && selection.blockIds.length > 0;
  const blockCount = isBlockSelection ? selection.blockIds.length : 0;

  const announcement = useMemo(() => {
    if (!isBlockSelection || blockCount === 0) return "";
    return `${blockCount} block${blockCount === 1 ? "" : "s"} selected`;
  }, [isBlockSelection, blockCount]);

  useEffect(() => {
    if (!isBlockSelection) {
      setRect(null);
      return;
    }

    const computeRect = () => {
      if (!selection || selection.type !== "block") return;

      const root = document.querySelector("[data-pen-editor-root]");
      if (!root) return;

      let minTop = Infinity;
      let maxBottom = -Infinity;
      let minLeft = Infinity;
      let maxRight = -Infinity;

      for (const blockId of selection.blockIds) {
        const el = root.querySelector(`[data-block-id="${blockId}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        minTop = Math.min(minTop, r.top);
        maxBottom = Math.max(maxBottom, r.bottom);
        minLeft = Math.min(minLeft, r.left);
        maxRight = Math.max(maxRight, r.right);
      }

      if (minTop < Infinity) {
        setRect(
          new DOMRect(minLeft, minTop, maxRight - minLeft, maxBottom - minTop),
        );
      }
    };

    computeRect();

    rafRef.current = requestAnimationFrame(computeRect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [selection, isBlockSelection]);

  if (!isBlockSelection || !rect) {
    return announcement ? (
      <div aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {announcement}
      </div>
    ) : null;
  }

  return (
    <>
      {renderAsChild(props, "div", {
        "data-pen-selection-rect": "",
        "data-selecting": "",
        "aria-hidden": "true",
        role: "presentation",
        style: {
          position: "fixed",
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          pointerEvents: "none",
          zIndex: 10,
        },
      })}
      <div aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {announcement}
      </div>
    </>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
