import { useEditorContext } from "../context/editorContext";
import { useFieldEditorContext } from "../context/fieldEditorContext";
import type { FieldEditor } from "@input/pen-types";

export function useFieldEditor(): FieldEditor | null {
	useEditorContext();
	return useFieldEditorContext();
}
