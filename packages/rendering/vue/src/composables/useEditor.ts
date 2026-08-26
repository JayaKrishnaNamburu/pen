import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { CreateEditorOptions, Editor } from "@input/pen-types";
import { onScopeDispose } from "vue";

/**
 * Get an editor for the current component scope. Passing an existing
 * editor returns it untouched; passing options (or nothing) creates one
 * on the default schema and destroys it when the scope is disposed.
 *
 * The distinction matters for ownership: an editor this composable
 * created is torn down with the component, while one passed in stays the
 * caller's to destroy.
 */
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
