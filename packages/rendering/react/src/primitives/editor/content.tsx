import React, { useRef, useEffect } from "react";
import { useEditorContext } from "../../context/editorContext.js";
import { useFieldEditorContext } from "../../context/fieldEditorContext.js";
import { useBlockList } from "../../hooks/useBlockList.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";
import { DATA_ATTRS } from "../../utils/dataAttributes.js";
import { EditorBlock } from "./block.js";

export interface EditorContentProps extends AsChildProps {
  virtualize?:
  | boolean
  | { overscan?: number; estimatedHeight?: number; mobileOverscan?: number };
  ref?: React.Ref<HTMLElement>;
}

export function EditorContent(props: EditorContentProps) {
  const { virtualize: _virtualize, ...rest } = props;
  const { editor, readonly } = useEditorContext();
  const fieldEditor = useFieldEditorContext();
  const blockIds = useBlockList(editor);
  const contentRef = useRef<HTMLElement>(null);

  const isEmpty = blockIds.length === 0;

  // Click-to-activate: when user clicks on a block, activate the field editor.
  // Shift-click: select a range of blocks (AC #22).
  useEffect(() => {
    const el = contentRef.current;
    if (!el || readonly || !fieldEditor) return;

    const resolveClickedBlockId = (event: MouseEvent): string | null => {
      const rawTarget = event.target;
      const target =
        rawTarget instanceof HTMLElement
          ? rawTarget
          : rawTarget instanceof Node
            ? rawTarget.parentElement
            : null;
      if (!target) return null;

      // Walk up to find the nearest block element
      let blockEl: HTMLElement | null = target;
      while (blockEl && blockEl !== el) {
        if (blockEl.hasAttribute(DATA_ATTRS.editorBlock)) break;
        blockEl = blockEl.parentElement;
      }

      let blockId = blockEl?.getAttribute("data-block-id") ?? null;
      if (!blockId) {
        const firstBlock = editor.firstBlock();
        if (!firstBlock) return null;
        blockId = firstBlock.id;
      }

      return blockId;
    };

    const handleMouseDown = (event: MouseEvent) => {
      const blockId = resolveClickedBlockId(event);
      if (!blockId) return;

      const block = editor.getBlock(blockId);
      if (!block) return;

      const schema = editor.schema.resolve(block.type);
      if (schema?.fieldEditor === "none") return;

      if (fieldEditor.activeBlockId === blockId && fieldEditor.isEditing) {
        return;
      }

      fieldEditor.activate(blockId);
    };

    const handleClick = (event: MouseEvent) => {
      const blockId = resolveClickedBlockId(event);
      if (!blockId) return;

      // Shift-click: select a range of blocks
      if (event.shiftKey) {
        const currentSelection = editor.selection;
        const anchorBlockId =
          currentSelection?.type === "text"
            ? currentSelection.anchor.blockId
            : currentSelection?.type === "block" && currentSelection.blockIds.length > 0
              ? currentSelection.blockIds[0]
              : null;

        if (anchorBlockId && anchorBlockId !== blockId) {
          const blockOrder = editor.documentState.blockOrder;
          const startIdx = blockOrder.indexOf(anchorBlockId);
          const endIdx = blockOrder.indexOf(blockId);
          if (startIdx >= 0 && endIdx >= 0) {
            const from = Math.min(startIdx, endIdx);
            const to = Math.max(startIdx, endIdx);
            const selectedIds = blockOrder.slice(from, to + 1);
            editor.selectBlocks(selectedIds);
            fieldEditor.deactivate();
            event.preventDefault();
            return;
          }
        }
      }

      const block = editor.getBlock(blockId);
      if (!block) return;

      const schema = editor.schema.resolve(block.type);
      if (schema?.fieldEditor === "none") {
        // Non-editable blocks: select instead of activating field editor
        editor.selectBlock(blockId);
        return;
      }

      if (fieldEditor.activeBlockId === blockId && fieldEditor.isEditing) {
        return;
      }

      fieldEditor.activate(blockId);
    };

    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("click", handleClick);
    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      el.removeEventListener("click", handleClick);
    };
  }, [editor, fieldEditor, readonly]);

  const blockElements = blockIds.map((blockId) => (
    <EditorBlock key={blockId} blockId={blockId} />
  ));

  const primitiveProps: Record<string, unknown> = {
    [DATA_ATTRS.editorContent]: "",
    [DATA_ATTRS.empty]: isEmpty || undefined,
  };

  return renderAsChild(
    {
      ...rest,
      ref: contentRef,
      children: (
        <>
          {blockElements}
          {rest.children}
        </>
      ),
    },
    "div",
    primitiveProps,
  );
}
