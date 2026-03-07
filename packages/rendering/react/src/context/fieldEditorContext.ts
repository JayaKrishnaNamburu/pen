import { createContext, useContext } from "react";
import type { FieldEditor } from "@pen/core";

export const FieldEditorContext = createContext<FieldEditor | null>(null);

export function useFieldEditorContext(): FieldEditor | null {
  return useContext(FieldEditorContext);
}
