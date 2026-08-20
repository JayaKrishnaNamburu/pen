import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { CreateEditorOptions, Editor } from "@input/pen-types";
import { onScopeDispose } from "vue";

export function useEditor(optionsOrEditor?: CreateEditorOptions | Editor): Editor {
  if (optionsOrEditor && "apply" in optionsOrEditor) {
    return optionsOrEditor;
  }

  const editor = createEditor({
    schema: defaultSchema,
    ...optionsOrEditor,
  });
  onScopeDispose(() => {
    editor.destroy();
  });
  return editor;
}
