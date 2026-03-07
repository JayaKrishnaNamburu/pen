import { createContext, useContext } from "react";
import type { FieldEditorStore } from "../field-editor/store.js";

export const FieldEditorContext = createContext<FieldEditorStore | null>(null);

export function useFieldEditorContext(): FieldEditorStore | null {
	return useContext(FieldEditorContext);
}
