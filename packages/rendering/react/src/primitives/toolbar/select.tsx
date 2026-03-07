import React from "react";
import { useToolbarContext } from "../../context/toolbarContext.js";
import { useEditorContext } from "../../context/editorContext.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";

export interface ToolbarSelectProps extends AsChildProps {
  format: string;
  options?: Array<{ value: string; label: string }>;
  ref?: React.Ref<HTMLElement>;
}

export function ToolbarSelect(props: ToolbarSelectProps) {
  const { format, options, ...rest } = props;
  const { editor, state } = useToolbarContext();
  const { readonly } = useEditorContext();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (readonly) return;
    const value = event.target.value;

    if (format === "blockType") {
      const selection = editor.selection;
      if (!selection) return;

      const blockId =
        selection.type === "text"
          ? selection.anchor.blockId
          : selection.type === "block" && selection.blockIds.length > 0
            ? selection.blockIds[0]
            : null;

      if (!blockId) return;

      editor.apply([
        {
          type: "convert-block",
          blockId,
          newType: value,
        },
      ]);
    }
  };

  const selectOptions = options
    ? options.map((opt) =>
        React.createElement("option", { key: opt.value, value: opt.value }, opt.label),
      )
    : null;

  const primitiveProps: Record<string, unknown> = {
    "data-pen-toolbar-select": "",
    "data-format": format,
    "data-current": state.blockType ?? undefined,
    value: state.blockType ?? "",
    onChange: handleChange,
  };

  return renderAsChild(
    { ...rest, children: selectOptions ?? rest.children },
    "select",
    primitiveProps,
  );
}
