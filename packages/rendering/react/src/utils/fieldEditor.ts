import { fieldEditorHostFacet } from "@input/pen-core";
import type { Editor, FieldEditor } from "@input/pen-types";
import type { FieldEditorStore } from "../field-editor/store";

export function getAttachedFieldEditor(editor: Editor): FieldEditor | null {
	return (editor.facet(fieldEditorHostFacet) as FieldEditor | null) ?? null;
}

export function getAttachedFieldEditorStore(
	editor: Editor,
): FieldEditorStore | null {
	return (editor.facet(fieldEditorHostFacet) as FieldEditorStore | null) ?? null;
}
