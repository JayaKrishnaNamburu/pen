import { createContext, useContext } from "react";
import type { Editor } from "@pen/core";

export interface PasteImporters {
  html?: {
    import(
      input: string,
      editor: Editor,
      options?: {
        undoGroup?: boolean;
        position?: import("@pen/core").Position;
      },
    ): void;
  };
  markdown?: {
    import(
      input: string,
      editor: Editor,
      options?: {
        undoGroup?: boolean;
        position?: import("@pen/core").Position;
      },
    ): void;
  };
}

export interface EditorContextValue {
  editor: Editor;
  readonly: boolean;
  importers?: PasteImporters;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.error(
        "Pen: useEditorContext must be used within <Pen.Editor.Root>. " +
          "Wrap your editor components in <Pen.Editor.Root editor={editor}>.",
      );
    }
    throw new Error("Missing Pen.Editor.Root context");
  }
  return ctx;
}
