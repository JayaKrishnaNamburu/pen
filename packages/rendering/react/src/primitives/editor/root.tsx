import React, { useRef, useEffect, useState } from "react";
import type { Editor } from "@pen/core";
import {
  EditorContext,
  type PasteImporters,
} from "../../context/editorContext.js";
import { FieldEditorContext } from "../../context/fieldEditorContext.js";
import { FieldEditorImpl } from "../../field-editor/fieldEditorImpl.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";
import { composeRefs } from "../../utils/composeRefs.js";
import { DATA_ATTRS } from "../../utils/dataAttributes.js";

export interface EditorRootProps extends AsChildProps {
  editor: Editor;
  readonly?: boolean;
  importers?: PasteImporters;
  ref?: React.Ref<HTMLElement>;
}

export function EditorRoot(props: EditorRootProps) {
  const { editor, readonly = false, importers, ref, ...rest } = props;
  const [focused, setFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(editor.documentState.isEmpty);
  const fieldEditorRef = useRef<FieldEditorImpl | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  if (!fieldEditorRef.current) {
    fieldEditorRef.current = new FieldEditorImpl(editor);
  }

  useEffect(() => {
    const unsubFocus = editor.on("focus", () => setFocused(true));
    const unsubBlur = editor.on("blur", () => setFocused(false));
    const unsubDoc = editor.on("documentChange", () => {
      setIsEmpty(editor.documentState.isEmpty);
    });
    return () => {
      unsubFocus();
      unsubBlur();
      unsubDoc();
    };
  }, [editor]);

  useEffect(() => {
    if (importers) {
      editor.internals.setSlot("paste:importers", importers);
    }
  }, [editor, importers]);

  useEffect(() => {
    return () => {
      fieldEditorRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    fieldEditorRef.current?.setRootElement(rootRef.current);
    return () => {
      fieldEditorRef.current?.setRootElement(null);
    };
  }, []);

  const primitiveProps: Record<string, unknown> = {
    [DATA_ATTRS.editorRoot]: "",
    [DATA_ATTRS.focused]: focused || undefined,
    [DATA_ATTRS.readonly]: readonly || undefined,
    [DATA_ATTRS.empty]: isEmpty || undefined,
    role: "textbox",
    "aria-multiline": "true",
    "aria-readonly": readonly,
  };

  return (
    <EditorContext.Provider value={{ editor, readonly, importers }}>
      <FieldEditorContext.Provider value={fieldEditorRef.current}>
        {renderAsChild(
          {
            ...rest,
            ref: composeRefs(ref, rootRef),
          },
          "div",
          primitiveProps,
        )}
      </FieldEditorContext.Provider>
    </EditorContext.Provider>
  );
}
