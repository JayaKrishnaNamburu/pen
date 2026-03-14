import { createContext, useContext } from "react";
import type { FieldEditorSession } from "../field-editor/controller";

export const FieldEditorContext = createContext<FieldEditorSession | null>(null);

export function useFieldEditorContext(): FieldEditorSession | null {
	return useContext(FieldEditorContext);
}
