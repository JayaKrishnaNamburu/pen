import React, { Children, cloneElement, isValidElement, useRef } from "react";
import type { BlockRenderContext, Decoration } from "@pen/types";
import { useEditorContext } from "../../context/editorContext";
import { useFieldEditorContext } from "../../context/fieldEditorContext";
import { useBlockDecorations } from "../../hooks/useBlockDecorations";
import { useBlockEditingState } from "../../hooks/useBlockEditingState";
import { useBlockModel } from "../../hooks/useBlockModel";
import { useBlockSelectionState } from "../../hooks/useBlockSelectionState";
import { useBlockSurfaceRole } from "../../hooks/useBlockSurfaceRole";
import { resolveRenderer } from "../../renderers/index";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { useBlockDropPreview } from "./dropPreviewContext";

export interface EditorBlockProps extends AsChildProps {
	blockId: string;
	ref?: React.Ref<HTMLElement>;
}

export function EditorBlock(props: EditorBlockProps) {
	const { blockId, ...rest } = props;
	const {
		editor,
		readonly,
		renderers,
		blockControls,
	} = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const isEditable = useBlockEditingState(fieldEditor, blockId);
	const blockModel = useBlockModel(editor, blockId);
	const isSelected = useBlockSelectionState(editor, blockId);
	const surfaceRole = useBlockSurfaceRole(editor, fieldEditor, blockId);
	const blockDecorations = useBlockDecorations(editor, blockId);
	const externalDropPosition = useBlockDropPreview(blockId);
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

	const Renderer = renderers?.[blockType] ?? resolveRenderer(blockType);
	const renderedBlock = injectBlockDecorationsIntoInlineContent(
		Renderer(block, renderCtx) as React.ReactNode,
		blockId,
		blockDecorations,
	);
	const headingLevel =
		blockType === "heading" && typeof block.props?.level === "number"
			? block.props.level
			: undefined;
	const blockControl = blockControls?.({
		blockId,
		blockType,
		selected: isSelected,
	});

	const isAiGenerating = blockDecorations.some(
		(d: Decoration) =>
			"attributes" in d &&
			Boolean(
				d.attributes[DATA_ATTRS.aiGenerating] ?? d.attributes["ai-generating"],
			),
	);
	const blockDecorationAttributes = mergeBlockDecorationAttributes(blockDecorations);

	const primitiveProps: Record<string, unknown> = {
		[DATA_ATTRS.editorBlock]: "",
		[DATA_ATTRS.blockId]: blockId,
		[DATA_ATTRS.blockType]: blockType,
		"data-level": headingLevel,
		[DATA_ATTRS.selected]: isSelected || undefined,
		[DATA_ATTRS.focused]: fieldEditor?.focusBlockId === blockId || undefined,
		[DATA_ATTRS.surfaceRole]: surfaceRole ?? undefined,
		[DATA_ATTRS.dropTarget]: externalDropPosition ? true : undefined,
		[DATA_ATTRS.dropPosition]: externalDropPosition,
		[DATA_ATTRS.aiGenerating]: isAiGenerating || undefined,
		tabIndex: -1,
		contentEditable:
			surfaceRole != null && surfaceRole !== "editable-inline"
				? false
				: undefined,
		spellCheck: isBlockEditable ? false : undefined,
		autoCorrect: isBlockEditable ? "off" : undefined,
		autoCapitalize: isBlockEditable ? "off" : undefined,
		...blockDecorationAttributes,
	};

	return renderAsChild(
		{
			...rest,
			children: (
				<>
					{blockControl}
					{renderedBlock}
				</>
			),
			ref: blockRef,
		},
		"div",
		primitiveProps,
	);
}

function injectBlockDecorationsIntoInlineContent(
	node: React.ReactNode,
	blockId: string,
	decorations: readonly Decoration[],
): React.ReactNode {
	if (!isValidElement(node)) {
		return node;
	}

	const props = node.props as {
		blockId?: string;
		children?: React.ReactNode;
		decorations?: readonly Decoration[];
	};
	const nextProps: {
		children?: React.ReactNode;
		decorations?: readonly Decoration[];
	} = {};

	if (props.blockId === blockId && props.decorations == null) {
		nextProps.decorations = decorations;
	}

	if (props.children) {
		const nextChildren = Children.map(props.children, (child) =>
			injectBlockDecorationsIntoInlineContent(child, blockId, decorations),
		);
		if (nextChildren !== props.children) {
			nextProps.children = nextChildren;
		}
	}

	if (Object.keys(nextProps).length === 0) {
		return node;
	}

	return cloneElement(node, nextProps);
}

function mergeBlockDecorationAttributes(
	decorations: readonly Decoration[],
): Record<string, unknown> {
	const attributes: Record<string, unknown> = {};
	const classNames: string[] = [];

	for (const decoration of decorations) {
		if (decoration.type !== "block") {
			continue;
		}
		if (
			decoration.position != null &&
			decoration.position !== "wrap"
		) {
			continue;
		}
		for (const [key, value] of Object.entries(decoration.attributes)) {
			if (key === "class") {
				classNames.push(String(value));
				continue;
			}
			attributes[key] = value;
		}
	}

	if (classNames.length > 0) {
		attributes.className = classNames.join(" ");
	}

	return attributes;
}
