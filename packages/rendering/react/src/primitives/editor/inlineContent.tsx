import React, { useRef, useEffect, useState } from "react";
import { useEditorContext } from "../../context/editorContext.js";
import { useFieldEditorContext } from "../../context/fieldEditorContext.js";
import { fullReconcileToDOM } from "../../field-editor/reconciler.js";
import { useFieldEditorState } from "../../hooks/useFieldEditorState.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";
import { DATA_ATTRS } from "../../utils/dataAttributes.js";

export interface InlineContentProps extends AsChildProps {
  blockId: string;
  placeholder?: string;
  ref?: React.Ref<HTMLElement>;
}

export function InlineContent(props: InlineContentProps) {
  const { blockId, placeholder, ...rest } = props;
  const { editor } = useEditorContext();
  const fieldEditor = useFieldEditorContext();
  const fieldEditorState = useFieldEditorState(fieldEditor);
  const elementRef = useRef<HTMLElement>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const isActive = fieldEditorState.activeBlockId === blockId;

  useEffect(() => {
    if (isActive && elementRef.current && fieldEditor) {
      fieldEditor.attachElement(elementRef.current);
    }
  }, [isActive, fieldEditor, blockId]);

  useEffect(() => {
    if (!isActive && elementRef.current) {
      const block = editor.getBlock(blockId);
      if (block) {
        const adapter = editor.internals.adapter;
        const doc = editor.internals.crdtDoc;
        const ydoc = adapter.raw(doc) as any;
        const blockMap = ydoc.getMap("blocks").get(blockId);
        const ytext = blockMap?.get("content");
        if (ytext && elementRef.current) {
          fullReconcileToDOM(ytext, elementRef.current, editor.schema);
          const text = ytext.toString();
          setIsEmpty(!text || text === "\u200B");
        }
      }
    }
  }, [isActive, editor, blockId]);

  useEffect(() => {
    const adapter = editor.internals.adapter;
    const doc = editor.internals.crdtDoc;
    const ydoc = adapter.raw(doc) as any;
    const blockMap = ydoc.getMap("blocks").get(blockId);
    const ytext = blockMap?.get("content");
    if (!ytext) return;

    const checkEmpty = () => {
      const text = ytext.toString();
      setIsEmpty(!text || text === "\u200B");
    };
    checkEmpty();

    const handler = () => checkEmpty();
    ytext.observe(handler);
    return () => ytext.unobserve(handler);
  }, [editor, blockId]);

  const showPlaceholder = isEmpty && placeholder;

  const primitiveProps: Record<string, unknown> = {
    [DATA_ATTRS.inlineContent]: "",
    "data-placeholder-visible": showPlaceholder ? "" : undefined,
    "data-placeholder": placeholder,
    style: showPlaceholder
      ? {
          position: "relative" as const,
        }
      : undefined,
  };

  return renderAsChild(
    { ...rest, ref: elementRef },
    "span",
    primitiveProps,
  );
}
