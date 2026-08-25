import { useEffect, useState } from "react";
import type { Editor } from "@input/pen-types";
import { createPenEditor } from "./penEditor";
import { applyStarterDocument } from "./starterDocument";

/**
 * Owns the one editor instance for the app.
 *
 * Returns `null` on the first render because the editor is created in an
 * effect, which keeps creation and teardown paired.
 */
export function usePenEditor(): Editor | null {
	const [editor, setEditor] = useState<Editor | null>(null);

	useEffect(() => {
		const nextEditor = createPenEditor();
		applyStarterDocument(nextEditor);
		setEditor(nextEditor);

		return () => {
			void nextEditor.destroy();
			setEditor(null);
		};
	}, []);

	return editor;
}
