import { useRef, useEffect, useReducer } from "react";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { CreateEditorOptions, Editor } from "@input/pen-types";

export function useEditor(
	optionsOrEditor?: CreateEditorOptions | Editor,
): Editor {
	const editorRef = useRef<Editor | null>(null);
	const isOwnedRef = useRef(false);
	const [, rebuild] = useReducer((generation: number) => generation + 1, 0);

	if (!editorRef.current) {
		if (optionsOrEditor && "apply" in optionsOrEditor) {
			editorRef.current = optionsOrEditor as Editor;
			isOwnedRef.current = false;
		} else {
			editorRef.current = createEditor({
				schema: defaultSchema,
				...optionsOrEditor,
			});
			isOwnedRef.current = true;
		}
	}

	useEffect(() => {
		// StrictMode runs setup, cleanup, then setup again for a single mount.
		// Reaching setup with a cleared ref means the first cleanup destroyed
		// the editor this component already rendered against, so rebuild
		// rather than hand the host a destroyed instance.
		if (isOwnedRef.current && editorRef.current === null) {
			rebuild();
		}
		return () => {
			if (isOwnedRef.current) {
				const owned = editorRef.current;
				editorRef.current = null;
				owned?.destroy();
			}
		};
	}, [rebuild]);

	return editorRef.current;
}
