import React from "react";
import type { Editor } from "@pen/core";
import { EditorRoot, type EditorRootProps } from "./primitives/editor/root.js";
import { EditorContent, type EditorContentProps } from "./primitives/editor/content.js";

export interface PenEditorProps
  extends Omit<EditorRootProps, "children">,
    Omit<EditorContentProps, "children"> {
  children?: React.ReactNode;
}

export function PenEditor(props: PenEditorProps) {
  const { editor, readonly, importers, virtualize, children, ...rest } = props;

  return (
    <EditorRoot editor={editor} readonly={readonly} importers={importers}>
      <EditorContent virtualize={virtualize} {...rest}>
        {children}
      </EditorContent>
    </EditorRoot>
  );
}
