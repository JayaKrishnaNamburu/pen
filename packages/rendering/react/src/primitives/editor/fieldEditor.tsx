import React from "react";
import { useFieldEditorContext } from "../../context/fieldEditorContext.js";
import { useFieldEditorState } from "../../hooks/useFieldEditorState.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";
import { DATA_ATTRS } from "../../utils/dataAttributes.js";

export interface FieldEditorWrapperProps extends AsChildProps {
  ref?: React.Ref<HTMLElement>;
}

/**
 * Wrapper component that exposes field editor state via data attributes.
 * Does not render content — it wraps the content area.
 */
export function EditorFieldEditor(props: FieldEditorWrapperProps) {
  const fieldEditor = useFieldEditorContext();
  const fieldEditorState = useFieldEditorState(fieldEditor);

  const isActive = fieldEditorState.isEditing;
  const blockCount = fieldEditorState.activeBlockIds.length;
  const isExpanded = blockCount > 1;
  const inputMode = fieldEditorState.inputMode;

  const primitiveProps: Record<string, unknown> = {
    [DATA_ATTRS.fieldEditor]: "",
    [DATA_ATTRS.active]: isActive || undefined,
    [DATA_ATTRS.inputMode]: isActive ? inputMode : undefined,
    [DATA_ATTRS.expanded]: isExpanded || undefined,
    [DATA_ATTRS.blockCount]: isExpanded ? blockCount : undefined,
  };

  return renderAsChild(props, "div", primitiveProps);
}
