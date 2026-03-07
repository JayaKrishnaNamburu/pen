import React, { useRef } from "react";
import { useEditorContext } from "../../context/editorContext.js";
import { useFieldEditorContext } from "../../context/fieldEditorContext.js";
import { useBlockDecorations } from "../../hooks/useBlockDecorations.js";
import { useBlockEditingState } from "../../hooks/useBlockEditingState.js";
import { useBlockModel } from "../../hooks/useBlockModel.js";
import { useBlockSelectionState } from "../../hooks/useBlockSelectionState.js";
import { useBlockSurfaceRole } from "../../hooks/useBlockSurfaceRole.js";
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
	const isEditable = useBlockEditingState(fieldEditor, blockId);
	const blockModel = useBlockModel(editor, blockId);
	const isSelected = useBlockSelectionState(editor, blockId);
	const surfaceRole = useBlockSurfaceRole(editor, fieldEditor, blockId);
	const blockDecorations = useBlockDecorations(editor, blockId);
	const blockRef = useRef<HTMLElement>(null);

	if (!blockModel.exists) return null;

	const block = editor.getBlock(blockId);
	if (!block) return null;

	const blockType = blockModel.type ?? block.type;

	const isBlockEditable = !readonly && !!fieldEditor && isEditable;

	const renderCtx: BlockRenderContext = {
		editable: isBlockEditable,
		selected: isSelected,
		decorations: blockDecorations,
		ref: blockRef,
	};

	const Renderer = resolveRenderer(blockType);

	const isAiGenerating = blockDecorations.some(
		(d: any) => d.type === "ai-generating" || d.attrs?.["ai-generating"],
	);

	const primitiveProps: Record<string, unknown> = {
		[DATA_ATTRS.editorBlock]: "",
		[DATA_ATTRS.blockId]: blockId,
		[DATA_ATTRS.blockType]: blockType,
		[DATA_ATTRS.selected]: isSelected || undefined,
		[DATA_ATTRS.surfaceRole]: surfaceRole ?? undefined,
		[DATA_ATTRS.aiGenerating]: isAiGenerating || undefined,
		tabIndex: -1,
		contentEditable:
			surfaceRole != null && surfaceRole !== "editable-inline"
				? false
				: undefined,
	};

	return renderAsChild(
		{
			...rest,
			children: Renderer(block, renderCtx) as React.ReactNode,
			ref: blockRef,
		},
		"div",
		primitiveProps,
	);
}
