import { createEditor } from "@pen/core";
import type { CreateEditorOptions, Editor } from "@pen/types";
import { onScopeDispose } from "vue";

export function useEditor(optionsOrEditor?: CreateEditorOptions | Editor): Editor {
  if (optionsOrEditor && "apply" in optionsOrEditor) {
    return optionsOrEditor;
  }

  const editor = createEditor(optionsOrEditor);
  onScopeDispose(() => {
    editor.destroy();
  });
  return editor;
}
