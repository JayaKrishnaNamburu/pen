import React from "react";
import { useToolbarContext } from "../../context/toolbarContext.js";
import { useEditorContext } from "../../context/editorContext.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";

export interface ToolbarToggleProps extends AsChildProps {
  format: string;
  ref?: React.Ref<HTMLElement>;
}

export function ToolbarToggle(props: ToolbarToggleProps) {
  const { format, ...rest } = props;
  const { editor, state } = useToolbarContext();
  const { readonly } = useEditorContext();

  const isActive = format in state.activeMarks;

  const handleClick = () => {
    if (readonly) return;

    const selection = editor.selection;
    if (!selection || selection.type !== "text") return;

    const from = Math.min(selection.anchor.offset, selection.focus.offset);
    const to = Math.max(selection.anchor.offset, selection.focus.offset);
    if (from === to) return;

    editor.apply([
      {
        type: "format-text",
        blockId: selection.anchor.blockId,
        offset: from,
        length: to - from,
        marks: { [format]: isActive ? null : true },
      },
    ]);
  };

  const primitiveProps: Record<string, unknown> = {
    "data-pen-toolbar-toggle": "",
    "data-active": isActive || undefined,
    "data-format": format,
    role: "button",
    "aria-pressed": isActive,
    onClick: handleClick,
  };

  return renderAsChild(rest, "button", primitiveProps);
}
