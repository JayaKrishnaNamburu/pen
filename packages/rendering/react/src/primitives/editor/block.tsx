import React, { useRef } from "react";
import { useEditorContext } from "../../context/editorContext.js";
import { useFieldEditorContext } from "../../context/fieldEditorContext.js";
import { useSelection } from "../../hooks/useSelection.js";
import { useDecorations } from "../../hooks/useDecorations.js";
import { useFieldEditorState } from "../../hooks/useFieldEditorState.js";
import { resolveRenderer } from "../../renderers/index.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";
import { DATA_ATTRS } from "../../utils/dataAttributes.js";
import type { BlockRenderContext } from "@pen/core";

export interface EditorBlockProps extends AsChildProps {
  blockId: string;
  ref?: React.Ref<HTMLElement>;
}

export function EditorBlock(props: EditorBlockProps) {
  const { blockId, ...rest } = props;
  const { editor, readonly } = useEditorContext();
  const fieldEditor = useFieldEditorContext();
  const fieldEditorState = useFieldEditorState(fieldEditor);
  const selection = useSelection(editor);
  const decorations = useDecorations(editor);
  const blockRef = useRef<HTMLElement>(null);

  const block = editor.getBlock(blockId);
  if (!block) return null;

  const isSelected =
    (selection?.type === "block" && selection.blockIds.includes(blockId)) ||
    (selection?.type === "text" && selection.blockRange.includes(blockId));

  const isEditable =
    !readonly &&
    !!fieldEditor &&
    fieldEditorState.activeBlockId === blockId;

  const blockDecorations = decorations.forBlock(blockId);

  const renderCtx: BlockRenderContext = {
    editable: isEditable,
    selected: isSelected,
    decorations: blockDecorations,
    ref: blockRef,
  };

  const Renderer = resolveRenderer(block.type);

  const isAiGenerating = !!decorations.forBlock(blockId)?.some(
    (d: any) => d.type === "ai-generating" || d.attrs?.["ai-generating"],
  );

  const primitiveProps: Record<string, unknown> = {
    [DATA_ATTRS.editorBlock]: "",
    [DATA_ATTRS.blockId]: blockId,
    [DATA_ATTRS.blockType]: block.type,
    [DATA_ATTRS.selected]: isSelected || undefined,
    [DATA_ATTRS.aiGenerating]: isAiGenerating || undefined,
  };

  return renderAsChild(
    { ...rest, children: Renderer(block, renderCtx) as React.ReactNode, ref: blockRef },
    "div",
    primitiveProps,
  );
}
