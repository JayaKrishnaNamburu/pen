import { useEditorContext } from "../context/editorContext.js";
import { useFieldEditorContext } from "../context/fieldEditorContext.js";
import type { FieldEditor } from "@pen/core";

export function useFieldEditor(): FieldEditor | null {
  useEditorContext();
  return useFieldEditorContext();
}
